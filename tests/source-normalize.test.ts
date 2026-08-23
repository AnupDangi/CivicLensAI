import { describe,expect,it } from "vitest";
import { normalizeSourceUrl,SourceUrlError } from "@/lib/source/normalize";

describe("normalizeSourceUrl",()=>{
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ","youtube:dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?si=abc","youtube:dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&utm_source=test","youtube:dQw4w9WgXcQ"],
    ["https://x.com/PIBFactCheck/status/1234567890123456789","x:1234567890123456789"],
    ["https://twitter.com/example/status/1234567890?s=20","x:1234567890"],
    ["https://www.instagram.com/reel/ABC_def-12/?igshid=x","instagram:ABC_def-12"],
    ["https://www.reddit.com/r/worldnews/comments/abc123/example/","reddit:abc123"],
    ["https://www.tiktok.com/@example/video/7451234567890123456","tiktok:7451234567890123456"],
  ])("canonicalizes %s",(url,key)=>expect(normalizeSourceUrl(url).canonicalKey).toBe(key));

  it("rejects X profiles",()=>{
    expect(()=>normalizeSourceUrl("https://x.com/PIBFactCheck?lang=en")).toThrowError(SourceUrlError);
    try{normalizeSourceUrl("https://x.com/PIBFactCheck")}catch(error){expect((error as SourceUrlError).code).toBe("PROFILE_NOT_SUPPORTED")}
  });

  it("rejects Instagram profiles",()=>expect(()=>normalizeSourceUrl("https://instagram.com/example/")).toThrow("individual Instagram"));

  it("removes tracking parameters and creates stable web keys",()=>{
    const a=normalizeSourceUrl("https://Example.com/news/?utm_source=social&b=2&a=1#top");
    const b=normalizeSourceUrl("https://example.com/news?a=1&b=2");
    expect(a.canonicalKey).toBe(b.canonicalKey);
    expect(a.canonicalUrl).toBe("https://example.com/news?a=1&b=2");
  });
});
