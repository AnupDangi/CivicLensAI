import "server-only";
import type { AnalysisResult, ContentArtifact, ExtractedSource } from "@/lib/domain";
import { claimQueuedAnalysis, getAnalysis, persistNormalizedResult, updateAnalysis } from "@/lib/analysis/repository";
import { factCheckArtifacts } from "@/lib/factcheck/engine";
import { extractSource } from "@/lib/source/extract";
import { analyzeUploadedArtifact } from "@/lib/media/analyze";

function fixtureExtraction(source: NonNullable<Awaited<ReturnType<typeof getAnalysis>>>["source"]): ExtractedSource {
  const host = new URL(source.canonicalUrl).hostname.replace(/^www\./, "");
  const sampleByKind: Record<string, string> = {
    X_POST: "The post contains a public factual statement that requires comparison with independent evidence.",
    INSTAGRAM_POST: "The post caption and attached media contain a factual statement selected for evidence review.",
    REDDIT_POST: "The Reddit post contains a factual statement selected for evidence review.",
    TIKTOK_POST: "The TikTok description, transcript, and media contain a factual statement selected for evidence review.",
    YOUTUBE: "The video room is ready for transcript-backed claim detection.",
    GENERIC_PAGE: "This public page contains a statement selected for evidence review in development mode.",
    ARTICLE: "This article contains a statement selected for evidence review in development mode.",
  };
  const artifacts: ContentArtifact[] = [{ kind: "TEXT", sourceUrl: source.canonicalUrl, originalLanguage: "en", originalText: sampleByKind[source.kind], extractionMethod: "fixture", coverage: "PARTIAL", failureReason: "Provider fixture used because FIXTURE_MODE is enabled." }];
  return { source, title: `Analysis of ${host}`, author: source.author, artifacts, limitations: ["Development fixture: source retrieval was not performed."] };
}

export async function runAnalysis(id: string): Promise<void> {
  const record = await getAnalysis(id);
  if (!record) return;
  if (!(await claimQueuedAnalysis(id))) return;
  try {
    const fixtureMode = process.env.FIXTURE_MODE === "true";
    let extracted: ExtractedSource;
    if (fixtureMode) {
      try {
        extracted = await extractSource(record.source);
        // if extraction yields no real text, fall back to fixture placeholder
        const hasText = extracted.artifacts.some((a) => (a.originalText || "").trim().length >= 80);
        if (!hasText) extracted = fixtureExtraction(record.source);
      } catch {
        extracted = fixtureExtraction(record.source);
      }
    } else {
      extracted = await extractSource(record.source);
    }
    await updateAnalysis(id, { stage: "TRANSCRIBING", progress: 36 });
    if(!fixtureMode){
      extracted.artifacts=await Promise.all(extracted.artifacts.map(async(artifact)=>{
        if(!["IMAGE","AUDIO","VIDEO"].includes(artifact.kind)||artifact.coverage==="COMPLETE"||artifact.extractionMethod==="youtube-embed")return artifact;
        try{return await analyzeUploadedArtifact({url:artifact.sourceUrl,kind:artifact.kind as "IMAGE"|"AUDIO"|"VIDEO"});}
        catch(error){return {...artifact,coverage:"PARTIAL" as const,failureReason:error instanceof Error?error.message:"Media enrichment failed."};}
      }));
    }
    await updateAnalysis(id, { stage: "EXTRACTING_CLAIMS", progress: 52 });
    let checked: Awaited<ReturnType<typeof factCheckArtifacts>>;
    try {
      checked = await factCheckArtifacts(extracted.artifacts, source.kind !== "YOUTUBE" ? "auto" : "skip");
      if (checked.claims.length === 0 && !process.env.OPENROUTER_API_KEY && !fixtureMode) {
        extracted.limitations.push("Transcript saved. Verification requires OPENROUTER_API_KEY (and optionally TAVILY_API_KEY) to extract and fact-check claims. Set them in Vercel env and redeploy.");
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The fact-check provider failed.";
      checked = {
        claims: [],
        detectedLanguages: [...new Set(extracted.artifacts.map((artifact) => artifact.originalLanguage))],
        fixture: false,
      };
      extracted.limitations.push(`Claim and evidence analysis was incomplete: ${reason}`);
    }
    await updateAnalysis(id, { stage: "EVALUATING", progress: 84 });
    const partial = extracted.artifacts.some((artifact) => artifact.coverage !== "COMPLETE") || extracted.limitations.length > 0;
    const result: AnalysisResult = {
      source: extracted.source,
      title: extracted.title,
      author: extracted.author,
      displayLanguage: "auto",
      detectedLanguages: checked.detectedLanguages,
      artifacts: extracted.artifacts,
      claims: checked.claims,
      limitations: extracted.limitations,
      fixture: checked.fixture,
      completedAt: new Date().toISOString(),
    };
    await persistNormalizedResult(id, result);
    await updateAnalysis(id, { stage: partial ? "PARTIAL" : "COMPLETE", progress: 100, result });
  } catch (error) {
    await updateAnalysis(id, { stage: "FAILED", progress: 100, failureReason: error instanceof Error ? error.message : "Analysis failed." });
  }
}
