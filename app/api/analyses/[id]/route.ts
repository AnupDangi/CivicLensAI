import { after, NextResponse } from "next/server";
import { getAnalysis, updateAnalysis } from "@/lib/analysis/repository";
import { runAnalysis } from "@/lib/analysis/pipeline";

const STALE_ANALYSIS_MS = 7 * 60_000;
const RECOVER_QUEUED_AFTER_MS = 10_000;

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let analysis = await getAnalysis(id);
  if (!analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
  const age = Date.now() - Date.parse(analysis.updatedAt);
  if (analysis.stage === "RESOLVING" && age >= RECOVER_QUEUED_AFTER_MS) after(() => runAnalysis(id));
  if (!["COMPLETE", "PARTIAL", "FAILED"].includes(analysis.stage) && age >= STALE_ANALYSIS_MS) {
    await updateAnalysis(id, { stage: "FAILED", progress: 100, failureReason: "Analysis timed out before completion. Retry the source to start a new run." });
    analysis = await getAnalysis(id) ?? analysis;
  }
  return NextResponse.json(analysis, { headers: { "cache-control": "no-store" } });
}
