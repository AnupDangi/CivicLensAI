import { createHash } from "node:crypto";
import type { NormalizedSource } from "@/lib/domain";

export class SourceUrlError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "SourceUrlError";
  }
}

function cleanUrl(input: string): URL {
  const value = input.trim();
  if (!value) throw new SourceUrlError("Paste a public URL to analyze.", "EMPTY_URL");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SourceUrlError("Enter a complete URL beginning with https://.", "INVALID_URL");
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new SourceUrlError("Only public HTTP and HTTPS URLs are supported.", "UNSUPPORTED_PROTOCOL");
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|igshid$|si$)/i.test(key)) url.searchParams.delete(key);
  }
  return url;
}

function youtubeId(url: URL): string | undefined {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0];
  if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return;
  if (url.pathname === "/watch") return url.searchParams.get("v") ?? undefined;
  const match = url.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{6,})/);
  return match?.[1];
}

export function normalizeSourceUrl(input: string): NormalizedSource {
  const url = cleanUrl(input);
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const videoId = youtubeId(url);

  if (videoId) {
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return { kind: "YOUTUBE", originalUrl: input, canonicalUrl, canonicalKey: `youtube:${videoId}`, externalId: videoId };
  }

  if (["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) {
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!match) {
      throw new SourceUrlError("CivicLens V0 supports individual X post URLs, not profiles or feeds.", "PROFILE_NOT_SUPPORTED");
    }
    const [, username, postId] = match;
    return {
      kind: "X_POST",
      originalUrl: input,
      canonicalUrl: `https://x.com/${username}/status/${postId}`,
      canonicalKey: `x:${postId}`,
      externalId: postId,
      author: username,
    };
  }

  if (["instagram.com", "m.instagram.com"].includes(host)) {
    const match = url.pathname.match(/^\/(?:p|reel|tv)\/([\w-]+)/);
    if (!match) {
      throw new SourceUrlError("CivicLens V0 supports individual Instagram post or reel URLs, not profiles or feeds.", "PROFILE_NOT_SUPPORTED");
    }
    const shortcode = match[1];
    return {
      kind: "INSTAGRAM_POST",
      originalUrl: input,
      canonicalUrl: `https://www.instagram.com/p/${shortcode}/`,
      canonicalKey: `instagram:${shortcode}`,
      externalId: shortcode,
    };
  }

  if (["reddit.com","old.reddit.com","www.reddit.com","redd.it"].includes(url.hostname.toLowerCase())) {
    const match=host==="redd.it"?url.pathname.match(/^\/([\w]+)$/):url.pathname.match(/^\/r\/[^/]+\/comments\/([\w]+)/);
    if(!match)throw new SourceUrlError("CivicLens V0 supports individual Reddit post URLs, not communities, profiles, or feeds.","PROFILE_NOT_SUPPORTED");
    const postId=match[1];
    return {kind:"REDDIT_POST",originalUrl:input,canonicalUrl:`https://www.reddit.com/comments/${postId}/`,canonicalKey:`reddit:${postId}`,externalId:postId};
  }

  if (["tiktok.com","m.tiktok.com"].includes(host)) {
    const match=url.pathname.match(/^\/@([^/]+)\/video\/(\d+)/);
    if(!match)throw new SourceUrlError("CivicLens V0 supports direct TikTok video URLs, not profiles or feeds.","PROFILE_NOT_SUPPORTED");
    const [,username,postId]=match;
    return {kind:"TIKTOK_POST",originalUrl:input,canonicalUrl:`https://www.tiktok.com/@${username}/video/${postId}`,canonicalKey:`tiktok:${postId}`,externalId:postId,author:username};
  }

  url.hostname = host;
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
  url.searchParams.sort();
  const canonicalUrl = url.toString();
  const hash = createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32);
  return { kind: "GENERIC_PAGE", originalUrl: input, canonicalUrl, canonicalKey: `web:${hash}` };
}

export function analysisDestination(source: NormalizedSource): string {
  return source.kind === "YOUTUBE"
    ? `/room/${encodeURIComponent(source.externalId ?? "")}`
    : `/check/${encodeURIComponent(source.canonicalKey.replace(":", "-"))}`;
}
