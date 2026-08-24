import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchers = vi.hoisted(() => ({
  direct: vi.fn(),
  reader: vi.fn(),
  SourceFetchError: class SourceFetchError extends Error {
    constructor(message: string, public readonly status?: number) {
      super(message);
    }
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/source/security", () => ({
  safeFetchHtml: fetchers.direct,
  fetchReaderHtml: fetchers.reader,
  SourceFetchError: fetchers.SourceFetchError,
}));

import { extractSource } from "@/lib/source/extract";

describe("generic source extraction", () => {
  const article = {
    url: "https://example.com/story",
    html: `<!doctype html><html lang="en"><head><title>Example report</title></head><body><article><h1>Example report</h1><p>This is a sufficiently long public article paragraph used to verify that the generic source extractor can parse and analyze ordinary HTML without a managed extractor.</p><p>A second paragraph gives Readability enough context to retain the article content.</p><img src="/evidence.jpg" alt="Evidence image"></article></body></html>`,
    contentType: "text/html",
  };

  beforeEach(() => {
    fetchers.direct.mockReset().mockResolvedValue(article);
    fetchers.reader.mockReset();
  });

  it("parses an article with the server-compatible DOM runtime", async () => {
    const result = await extractSource({
      kind: "GENERIC_PAGE",
      originalUrl: "https://example.com/story",
      canonicalUrl: "https://example.com/story",
      canonicalKey: "web:example-story",
    });

    expect(result.title).toBe("Example report");
    expect(result.artifacts[0]).toMatchObject({ kind: "TEXT", extractionMethod: "readability", originalLanguage: "en" });
    expect(result.artifacts[0].originalText).toContain("generic source extractor");
    expect(result.artifacts).toContainEqual(expect.objectContaining({ kind: "IMAGE", sourceUrl: "https://example.com/evidence.jpg" }));
  });

  it("uses the reader fallback when a publisher blocks direct server access", async () => {
    fetchers.direct.mockRejectedValue(new fetchers.SourceFetchError("The source returned HTTP 403.", 403));
    fetchers.reader.mockResolvedValue(article);

    const result = await extractSource({
      kind: "GENERIC_PAGE",
      originalUrl: "https://example.com/story",
      canonicalUrl: "https://example.com/story",
      canonicalKey: "web:example-story",
    });

    expect(fetchers.reader).toHaveBeenCalledWith("https://example.com/story");
    expect(result.artifacts[0]).toMatchObject({ extractionMethod: "reader-fallback-readability" });
    expect(result.limitations).toContain("The publisher blocked direct server access; CivicLens analyzed the public reader fallback instead.");
  });
});
