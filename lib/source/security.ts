import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 4;
export const MAX_HTML_BYTES = 5 * 1024 * 1024;

function isPrivateV4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateV6(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  return version === 4 ? isPrivateV4(address) : version === 6 ? isPrivateV6(address) : true;
}

export async function assertPublicUrl(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Unsupported URL protocol.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Private network URLs cannot be analyzed.");
  }

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Private network URLs cannot be analyzed.");
    return;
  }

  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The URL resolves to a private or unavailable network address.");
  }
}

export async function safeFetchHtml(input: string): Promise<{ url: string; html: string; contentType: string }> {
  let current = new URL(input);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "user-agent": "CivicLens/0.1 (+https://civiclens.app; public fact-check preview)",
        accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The source returned an invalid redirect.");
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!contentType.startsWith("text/html") && contentType !== "text/plain" && contentType !== "application/xhtml+xml") {
      throw new Error(`Unsupported page type: ${contentType || "unknown"}.`);
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_HTML_BYTES) throw new Error("The page exceeds the 5 MB extraction limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("The page exceeds the 5 MB extraction limit.");
    return { url: current.toString(), html: new TextDecoder().decode(bytes), contentType };
  }
  throw new Error("The source redirected too many times.");
}
