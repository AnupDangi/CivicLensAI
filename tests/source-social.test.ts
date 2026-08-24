import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getXpozClient: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/xpoz/client", () => ({ getXpozClient: mocks.getXpozClient }));

import { extractSocialWithXpoz } from "@/lib/source/xpoz";

describe("supported social source extraction", () => {
  const client = {
    twitter: { getPostsByIds: vi.fn() },
    instagram: { getPostsByIds: vi.fn() },
    instagramLive: { getPost: vi.fn() },
    reddit: { getPostWithComments: vi.fn() },
    tiktok: { getPostsByIds: vi.fn() },
  };

  beforeEach(() => {
    mocks.getXpozClient.mockReset().mockResolvedValue(client);
    for (const service of Object.values(client)) {
      for (const method of Object.values(service)) method.mockReset();
    }
  });

  it("extracts an individual X post", async () => {
    client.twitter.getPostsByIds.mockResolvedValue([{ text: "A public claim for review.", lang: "en", authorUsername: "civiclens", mediaUrls: [], urls: [] }]);
    const result = await extractSocialWithXpoz({ kind: "X_POST", originalUrl: "https://x.com/civiclens/status/1", canonicalUrl: "https://x.com/civiclens/status/1", canonicalKey: "x:1", externalId: "1" });
    expect(result.artifacts[0]).toMatchObject({ kind: "TEXT", originalText: "A public claim for review." });
  });

  it("extracts Instagram, Reddit, and TikTok posts", async () => {
    client.instagram.getPostsByIds.mockResolvedValue([{ caption: "Instagram public post", username: "civic" }]);
    client.reddit.getPostWithComments.mockResolvedValue({ post: { title: "Reddit headline", selftext: "Reddit text" }, comments: [] });
    client.tiktok.getPostsByIds.mockResolvedValue([{ description: "TikTok public post", descriptionLanguage: "en", videoUrl: [] }]);

    const [instagram, reddit, tiktok] = await Promise.all([
      extractSocialWithXpoz({ kind: "INSTAGRAM_POST", originalUrl: "https://instagram.com/p/abc", canonicalUrl: "https://instagram.com/p/abc", canonicalKey: "instagram:abc", externalId: "abc" }),
      extractSocialWithXpoz({ kind: "REDDIT_POST", originalUrl: "https://reddit.com/comments/abc", canonicalUrl: "https://reddit.com/comments/abc", canonicalKey: "reddit:abc", externalId: "abc" }),
      extractSocialWithXpoz({ kind: "TIKTOK_POST", originalUrl: "https://tiktok.com/@civic/video/1", canonicalUrl: "https://tiktok.com/@civic/video/1", canonicalKey: "tiktok:1", externalId: "1" }),
    ]);

    expect(instagram.artifacts[0].originalText).toBe("Instagram public post");
    expect(reddit.artifacts[0].originalText).toContain("Reddit headline");
    expect(tiktok.artifacts[0].originalText).toBe("TikTok public post");
  });
});
