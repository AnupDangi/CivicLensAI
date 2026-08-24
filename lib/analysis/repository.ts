import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import type { AnalysisRecord, AnalysisResult, AnalysisStage, NormalizedSource } from "@/lib/domain";
import { getDatabase } from "@/lib/db/client";
import { analysisRuns, claims, contentArtifacts, evidence, factChecks, sources } from "@/lib/db/schema";

type MemoryStore = Map<string, AnalysisRecord>;
const globalStore = globalThis as typeof globalThis & { __civicLensAnalyses?: MemoryStore };
const memory = globalStore.__civicLensAnalyses ?? new Map<string, AnalysisRecord>();
globalStore.__civicLensAnalyses = memory;

function now() { return new Date().toISOString(); }

function sourceFromRow(row: typeof sources.$inferSelect): NormalizedSource {
  return {
    kind: row.kind as NormalizedSource["kind"], originalUrl: row.originalUrl, canonicalUrl: row.canonicalUrl,
    canonicalKey: row.canonicalKey, externalId: row.externalId ?? undefined, author: row.author ?? undefined,
    publishedAt: row.publishedAt?.toISOString(),
  };
}

export async function createAnalysis(source: NormalizedSource, displayLanguage: string, refresh = false): Promise<{ record: AnalysisRecord; reused: boolean }> {
  const db = getDatabase();
  const canonicalKey = source.canonicalKey;

  if (!db) {
    if (!refresh) {
      const cached = [...memory.values()].find((item) => item.source.canonicalKey === canonicalKey && ["COMPLETE", "PARTIAL"].includes(item.stage) && Date.now() - Date.parse(item.createdAt) < 86_400_000);
      if (cached) return { record: cached, reused: true };
    }
    const createdAt = now();
    const record: AnalysisRecord = { id: randomUUID(), source, displayLanguage, stage: "RESOLVING", progress: 5, createdAt, updatedAt: createdAt };
    memory.set(record.id, record);
    return { record, reused: false };
  }

  const [sourceRow] = await db.insert(sources).values({
    kind: source.kind, originalUrl: source.originalUrl, canonicalUrl: source.canonicalUrl, canonicalKey: canonicalKey,
    externalId: source.externalId, author: source.author, publishedAt: source.publishedAt ? new Date(source.publishedAt) : undefined,
  }).onConflictDoUpdate({ target: sources.canonicalKey, set: { canonicalUrl: source.canonicalUrl, originalUrl: source.originalUrl, updatedAt: new Date() } }).returning();

  if (!refresh) {
    const cachedRun = await db.select().from(analysisRuns).where(and(eq(analysisRuns.sourceId, sourceRow.id), gt(analysisRuns.createdAt, new Date(Date.now() - 86_400_000)))).orderBy(desc(analysisRuns.createdAt)).limit(1);
    if (cachedRun[0] && cachedRun[0].stage !== "FAILED") {
      const cachedRecord: AnalysisRecord = { id: cachedRun[0].id, source: sourceFromRow(sourceRow), displayLanguage: cachedRun[0].displayLanguage, stage: cachedRun[0].stage as AnalysisStage, progress: cachedRun[0].progress, result: cachedRun[0].resultJson ?? undefined, failureReason: cachedRun[0].failureReason ?? undefined, createdAt: cachedRun[0].createdAt.toISOString(), updatedAt: cachedRun[0].updatedAt.toISOString() };
      return { record: cachedRecord, reused: true };
    }
  }
  const [run] = await db.insert(analysisRuns).values({ sourceId: sourceRow.id, displayLanguage }).returning();
  return { record: { id: run.id, source: sourceFromRow(sourceRow), displayLanguage, stage: run.stage as AnalysisStage, progress: run.progress, createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString() }, reused: false };
}

export async function getAnalysis(id: string): Promise<AnalysisRecord | undefined> {
  const db = getDatabase();
  if (!db) return memory.get(id);
  const rows = await db.select({ run: analysisRuns, source: sources }).from(analysisRuns).innerJoin(sources, eq(analysisRuns.sourceId, sources.id)).where(eq(analysisRuns.id, id)).limit(1);
  const row = rows[0];
  if (!row) return;
  return { id: row.run.id, source: sourceFromRow(row.source), displayLanguage: row.run.displayLanguage, stage: row.run.stage as AnalysisStage, progress: row.run.progress, result: row.run.resultJson ?? undefined, failureReason: row.run.failureReason ?? undefined, createdAt: row.run.createdAt.toISOString(), updatedAt: row.run.updatedAt.toISOString() };
}

export async function updateAnalysis(id: string, patch: Partial<Pick<AnalysisRecord, "stage" | "progress" | "result" | "failureReason">>): Promise<void> {
  const db = getDatabase();
  if (!db) {
    const current = memory.get(id);
    if (current) memory.set(id, { ...current, ...patch, updatedAt: now() });
    return;
  }
  await db.update(analysisRuns).set({ stage: patch.stage, progress: patch.progress, resultJson: patch.result, fixture: patch.result?.fixture, failureReason: patch.failureReason, updatedAt: new Date(), completedAt: patch.result ? new Date() : undefined }).where(eq(analysisRuns.id, id));
}

export async function persistNormalizedResult(id: string, result: AnalysisResult): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  if (result.artifacts.length) await db.insert(contentArtifacts).values(result.artifacts.map((artifact) => ({ analysisId: id, kind: artifact.kind, sourceUrl: artifact.sourceUrl, originalLanguage: artifact.originalLanguage, originalText: artifact.originalText, storageKey: artifact.storageKey, extractionMethod: artifact.extractionMethod, coverage: artifact.coverage, failureReason: artifact.failureReason, metadata: artifact.metadata, deleteAfter: artifact.storageKey ? new Date(Date.now() + 86_400_000) : undefined })));
  for (const claim of result.claims) {
    await db.insert(claims).values({ id: claim.id, analysisId: id, originalText: claim.originalText, normalizedEnglish: claim.normalizedEnglish, language: claim.language, claimType: claim.claimType, countryCode: claim.countryCode, jurisdiction: claim.jurisdiction, sourceReference: claim.sourceReference, searchQueries: claim.searchQueries });
    if (claim.evidence.length) await db.insert(evidence).values(claim.evidence.map((item) => ({ id: item.id, claimId: claim.id, url: item.url, title: item.title, publisher: item.publisher, snippet: item.snippet, sourceTier: item.sourceTier, sourceType: item.sourceType, stance: item.stance, matchedBecause: item.matchedBecause, publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined })));
    await db.insert(factChecks).values({ claimId: claim.id, verdict: claim.verdict, evidenceStrength: claim.evidenceStrength, primarySourceAvailable: claim.primarySourceAvailable, summary: claim.summary, reasoning: claim.reasoning, limitations: claim.limitations, model: result.fixture ? "fixture" : process.env.OPENROUTER_FAST_MODEL || "google/gemini-flash-latest" });
  }
}
