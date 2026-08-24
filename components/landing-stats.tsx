/* eslint-disable react-hooks/error-boundaries */
import { connection } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { sources, analysisRuns } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { roomIdForCanonicalKey } from "@/lib/source/normalize";

export async function LandingStats() {
  await connection();
  const db = getDatabase();
  if (!db) return null;
  try {
    const [srcCount] = await db.select({ c: sql<number>`count(*)::int` }).from(sources);
    const [anaCount] = await db.select({ c: sql<number>`count(*)::int` }).from(analysisRuns);
    const totalSources = srcCount?.c ?? 0;
    const totalAnalyses = anaCount?.c ?? 0;
    return (
      <section className="landing-stats" aria-label="Project statistics">
        <div className="shell">
          <div className="stats-grid">
            <div className="stat-card">
              <strong>{totalSources}</strong>
              <span>pages / sites created</span>
            </div>
            <div className="stat-card">
              <strong>{totalAnalyses}</strong>
              <span>links analyzed</span>
            </div>
          </div>
        </div>
      </section>
    );
  } catch {
    return null;
  }
}

export async function RecentSources() {
  await connection();
  const db = getDatabase();
  if (!db) return <p className="empty-state">Add a link to get started.</p>;
  try {
    const recent = await db
      .select({
        id: sources.id,
        kind: sources.kind,
        canonicalUrl: sources.canonicalUrl,
        originalUrl: sources.originalUrl,
        canonicalKey: sources.canonicalKey,
        externalId: sources.externalId,
        createdAt: sources.createdAt,
      })
      .from(sources)
      .orderBy(desc(sources.createdAt))
      .limit(8);

    if (!recent.length) return <p className="empty-state">No links yet. Paste a YouTube, Reddit, X or article URL above.</p>;

    // Fetch latest analysisId per source for linking
    const withAna = await Promise.all(
      recent.map(async (s) => {
        const [run] = await db
          .select({ id: analysisRuns.id })
          .from(analysisRuns)
          .where(eq(analysisRuns.sourceId, s.id))
          .orderBy(desc(analysisRuns.createdAt))
          .limit(1);
        let href: string;
        if (run) href = `/room/${encodeURIComponent(roomIdForCanonicalKey(s.canonicalKey))}?analysis=${run.id}`;
        else href = s.canonicalUrl;
        const label =
          s.kind === "YOUTUBE"
            ? "YouTube"
            : s.kind === "REDDIT_POST"
              ? "Reddit"
              : s.kind === "X_POST"
                ? "X"
                : s.kind === "INSTAGRAM_POST"
                  ? "Instagram"
                  : s.kind === "TIKTOK_POST"
                    ? "TikTok"
                    : "Web";
        const title = s.canonicalUrl.replace(/^https?:\/\//, "").slice(0, 60);
        return { ...s, href, label, title };
      })
    );

    return (
      <div className="recent-links">
        {withAna.map((s) => (
          <a key={s.id} href={s.href} className="recent-link">
            <div className="link-info">
              <strong>{s.label}</strong>
              <span>{s.title}</span>
            </div>
            <div className="recent-link-action"><span className="link-url">{s.canonicalUrl.slice(0, 70)}{s.canonicalUrl.length > 70 ? "…" : ""}</span><strong>Join room →</strong></div>
          </a>
        ))}
      </div>
    );
  } catch {
    return <p className="empty-state">Could not load recent links.</p>;
  }
}
