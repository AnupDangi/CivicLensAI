import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { comments, sources } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

const InsertSchema = z.object({
  sourceId: z.string().uuid().optional(),
  sourceKey: z.string().regex(/^(youtube|x|instagram|reddit|tiktok|web):[\w-]+$/).optional(),
  videoId: z.string().regex(/^[\w-]{6,}$/).optional(),
  analysisId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  authorName: z.string().min(1).max(80).optional(),
  isAnonymous: z.boolean().default(true),
  body: z.string().min(1).max(2000),
}).refine((value) => value.sourceId || value.sourceKey || value.videoId, { message: "A sourceId, sourceKey, or videoId is required." });

function publicComment(comment: typeof comments.$inferSelect) {
  return {
    ...comment,
    author: comment.isAnonymous ? "Anonymous participant" : comment.authorName || "Participant",
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedSourceId = searchParams.get("sourceId");
    const sourceKey = searchParams.get("sourceKey");
    const videoId = searchParams.get("videoId");
    
    const db = getDatabase();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    let sourceId = requestedSourceId;
    if (!sourceId && sourceKey) {
      sourceId = (await db.select({ id: sources.id }).from(sources).where(eq(sources.canonicalKey, sourceKey)).limit(1))[0]?.id ?? null;
    }
    if (!sourceId && videoId) {
      sourceId = (await db.select({ id: sources.id }).from(sources).where(eq(sources.canonicalKey, `youtube:${videoId}`)).limit(1))[0]?.id ?? null;
    }
    if (!sourceId) return NextResponse.json({ comments: [] });
    const data = await db.select().from(comments).where(eq(comments.sourceId, sourceId)).orderBy(desc(comments.createdAt)).limit(50);
    return NextResponse.json({ comments: data.map(publicComment) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = InsertSchema.parse(await request.json());
    const db = getDatabase();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    let sourceId = body.sourceId;
    if (!sourceId && body.sourceKey) {
      sourceId = (await db.select({ id: sources.id }).from(sources).where(eq(sources.canonicalKey, body.sourceKey)).limit(1))[0]?.id;
    }
    if (!sourceId && body.videoId) {
      const canonicalUrl = `https://www.youtube.com/watch?v=${body.videoId}`;
      const [resolvedSource] = await db.insert(sources).values({kind:"YOUTUBE",originalUrl:canonicalUrl,canonicalUrl,canonicalKey:`youtube:${body.videoId}`,externalId:body.videoId}).onConflictDoUpdate({target:sources.canonicalKey,set:{updatedAt:new Date()}}).returning({id:sources.id});
      sourceId = resolvedSource?.id;
    }
    if (!sourceId) return NextResponse.json({ error: "Source not found" }, { status: 404 });

    const [comment] = await db
      .insert(comments)
      .values({
        sourceId,
        analysisId: body.analysisId,
        parentId: body.parentId,
        authorName: body.isAnonymous ? undefined : body.authorName,
        isAnonymous: body.isAnonymous,
        body: body.body,
      })
      .returning();

    return NextResponse.json({ comment: publicComment(comment) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create comment" }, { status: 400 });
  }
}
