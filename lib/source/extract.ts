import "server-only";

import { Readability } from "@mozilla/readability";
import { fetchTranscript } from "youtube-transcript";
import type { ContentArtifact, ExtractedSource, NormalizedSource } from "@/lib/domain";
import { safeFetchHtml } from "@/lib/source/security";
import { extractSocialWithXpoz } from "@/lib/source/xpoz";

const MAX_TEXT_CHARS = 100_000;
const MAX_IMAGES = 12;

type ManagedExtraction = {
  title?: string;
  author?: string;
  text?: string;
  language?: string;
  images?: string[];
  videos?: string[];
  linkedPages?: Array<{ url: string; text?: string }>;
};

function languageFromHtml(document: Document): string {
  return document.documentElement.lang?.trim() || "und";
}

function absoluteUrl(value: string, base: string): string | undefined {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return;
  }
}

function pageArtifacts(document: Document, finalUrl: string, text: string, language: string): ContentArtifact[] {
  const artifacts: ContentArtifact[] = [{
    kind: "TEXT",
    sourceUrl: finalUrl,
    originalLanguage: language,
    originalText: text.slice(0, MAX_TEXT_CHARS),
    extractionMethod: "readability",
    coverage: text.length > MAX_TEXT_CHARS ? "PARTIAL" : "COMPLETE",
    failureReason: text.length > MAX_TEXT_CHARS ? "Text was truncated at 100,000 characters." : undefined,
  }];

  const seen = new Set<string>();
  for (const node of [...document.querySelectorAll<HTMLImageElement>("img[src]")]) {
    const src = absoluteUrl(node.currentSrc || node.src, finalUrl);
    if (!src || seen.has(src) || src.startsWith("data:")) continue;
    seen.add(src);
    artifacts.push({
      kind: "IMAGE",
      sourceUrl: src,
      originalLanguage: language,
      originalText: node.alt || undefined,
      extractionMethod: "html-image",
      coverage: "PARTIAL",
      failureReason: "Image queued for multimodal analysis when an OpenRouter key is configured.",
    });
    if (seen.size >= MAX_IMAGES) break;
  }
  return artifacts;
}

async function extractGeneric(source: NormalizedSource): Promise<ExtractedSource> {
  const fetched = await safeFetchHtml(source.canonicalUrl);
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(fetched.html, { url: fetched.url });
  const document = dom.window.document;
  const readable = new Readability(document.cloneNode(true) as Document).parse();
  const fallbackText = document.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const text = readable?.textContent?.trim() || fallbackText;
  if (text.length < 80) throw new Error("The public page did not expose enough readable content.");
  const language = languageFromHtml(document);
  const title = readable?.title || document.title || new URL(fetched.url).hostname;
  const extractedSource: NormalizedSource = {
    ...source,
    kind: readable?.textContent && readable.textContent.length > 500 ? "ARTICLE" : "GENERIC_PAGE",
    canonicalUrl: fetched.url,
  };
  return {
    source: extractedSource,
    title,
    author: readable?.byline ?? undefined,
    artifacts: pageArtifacts(document, fetched.url, text, language),
    limitations: readable ? [] : ["The page did not expose article metadata; CivicLens analyzed visible page text."],
  };
}

async function extractManaged(source: NormalizedSource): Promise<ExtractedSource | undefined> {
  if (!process.env.MANAGED_EXTRACTOR_URL || !process.env.MANAGED_EXTRACTOR_API_KEY) return;
  const response = await fetch(process.env.MANAGED_EXTRACTOR_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.MANAGED_EXTRACTOR_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ url: source.canonicalUrl, maxImages: MAX_IMAGES, includeMedia: true }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Managed extractor returned ${response.status}.`);
  const data = await response.json() as ManagedExtraction;
  const artifacts: ContentArtifact[] = [];
  if (data.text) artifacts.push({ kind: "TEXT", sourceUrl: source.canonicalUrl, originalLanguage: data.language || "und", originalText: data.text.slice(0, MAX_TEXT_CHARS), extractionMethod: "managed-extractor", coverage: data.text.length > MAX_TEXT_CHARS ? "PARTIAL" : "COMPLETE" });
  for (const image of (data.images ?? []).slice(0, MAX_IMAGES)) artifacts.push({ kind: "IMAGE", sourceUrl: image, originalLanguage: data.language || "und", extractionMethod: "managed-extractor", coverage: "PARTIAL", failureReason: "Image queued for multimodal analysis." });
  for (const video of (data.videos ?? []).slice(0, 3)) artifacts.push({ kind: "VIDEO", sourceUrl: video, originalLanguage: data.language || "und", extractionMethod: "managed-extractor", coverage: "PARTIAL", failureReason: "Video queued for transcription and frame analysis." });
  for (const linked of (data.linkedPages ?? []).slice(0, 3)) artifacts.push({ kind: "LINKED_PAGE", sourceUrl: linked.url, originalLanguage: data.language || "und", originalText: linked.text?.slice(0, MAX_TEXT_CHARS), extractionMethod: "managed-extractor", coverage: linked.text ? "COMPLETE" : "PARTIAL" });
  if (!artifacts.length) return;
  return { source, title: data.title || new URL(source.canonicalUrl).hostname, author: data.author, artifacts, limitations: [] };
}

function transcriptTimestamp(offset: number, milliseconds: boolean): string {
  const totalSeconds = milliseconds ? Math.floor(offset / 1_000) : Math.floor(offset);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function extractYoutubeCaptions(source: NormalizedSource): Promise<ContentArtifact | undefined> {
  if (!source.externalId) return;
  const timedFetch: typeof fetch = (input, init) => fetch(input, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  let language: string | undefined;
  let isLive = false;
  try {
    const playerResponse = await timedFetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14)" },
      body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } }, videoId: source.externalId }),
    });
    const player = await playerResponse.json() as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Array<{ languageCode?: string }>; audioTracks?: Array<{ defaultCaptionTrackIndex?: number }> } }; playabilityStatus?: { liveStreamability?: { liveStreamabilityRenderer?: { offlineSlate?: unknown } } }; videoDetails?: { isLive?: boolean; isLiveContent?: boolean } };
    const renderer = player.captions?.playerCaptionsTracklistRenderer;
    const defaultIndex = renderer?.audioTracks?.find((track) => typeof track.defaultCaptionTrackIndex === "number")?.defaultCaptionTrackIndex;
    language = typeof defaultIndex === "number" ? renderer?.captionTracks?.[defaultIndex]?.languageCode : undefined;
    isLive = Boolean(player.videoDetails?.isLive || player.videoDetails?.isLiveContent);
  } catch {
    // The transcript package still has its own public-page fallback.
  }
  let segments: Awaited<ReturnType<typeof fetchTranscript>> = [];
  try {
    segments = await fetchTranscript(source.externalId, { fetch: timedFetch, lang: language });
  } catch (e) {
    // youtube-transcript throws for live or no captions — treat as no static transcript
    if (isLive) return undefined;
    throw e;
  }
  if (!segments.length) return;
  const originalLanguage = segments.find((segment) => segment.lang)?.lang || "und";
  const milliseconds = segments.some((segment) => segment.duration > 100);
  const originalText = segments
    .map((segment) => `[${transcriptTimestamp(segment.offset, milliseconds)}] ${segment.text}`)
    .join("\n")
    .slice(0, MAX_TEXT_CHARS);
  return {
    kind: "AUDIO",
    sourceUrl: source.canonicalUrl,
    originalLanguage,
    originalText,
    extractionMethod: "youtube-public-captions",
    coverage: originalText.length >= MAX_TEXT_CHARS ? "PARTIAL" : "COMPLETE",
    failureReason: originalText.length >= MAX_TEXT_CHARS ? "Transcript was truncated at 100,000 characters." : undefined,
    metadata: {
      segmentCount: segments.length,
      includesTimestamps: true,
    },
  };
}

export async function extractSource(source: NormalizedSource): Promise<ExtractedSource> {
  if (["X_POST","INSTAGRAM_POST","REDDIT_POST","TIKTOK_POST"].includes(source.kind)) {
    const xpoz = await extractSocialWithXpoz(source).catch(() => undefined);
    if (xpoz) return xpoz;
    const managed = await extractManaged(source).catch(() => undefined);
    if (managed) return managed;
    throw new Error("The social post could not be retrieved through Xpoz. Use the paste/upload fallback.");
  }
  if (source.kind === "YOUTUBE") {
    const managed = await extractManaged(source).catch(() => undefined);
    if (managed) return managed;
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(source.canonicalUrl)}&format=json`;
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
    const data = response.ok ? await response.json() as Record<string, string> : {};
    const captions = await extractYoutubeCaptions(source).catch(() => undefined);
    const artifacts: ContentArtifact[] = [
      {
        kind: "VIDEO",
        sourceUrl: source.canonicalUrl,
        originalLanguage: captions?.originalLanguage || "und",
        extractionMethod: "youtube-embed",
        coverage: "PARTIAL",
        failureReason: "Speech captions are analyzed when available; visual frame coverage requires a configured managed media worker.",
      },
    ];
    if (captions) artifacts.push(captions);
    return {
      source,
      title: data.title || "YouTube civic room",
      author: data.author_name,
      artifacts,
      limitations: captions
        ? ["Public captions were analyzed. Visual claims still require managed frame extraction."]
        : ["No public captions were available yet. CivicLens will retry during the live room refresh cycle."],
    };
  }
  try {
    return await extractGeneric(source);
  } catch (error) {
    const managed = await extractManaged(source).catch(() => undefined);
    if (managed) return managed;
    throw error;
  }
}
