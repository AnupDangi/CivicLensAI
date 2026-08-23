import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { comments, sources } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const InsertSchema = z.object({
  sourceId: z.string().uuid(),
  analysisId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  authorName: z.string().min(1).max(80).optional(),
  isAnonymous: z.boolean().default(true),
  body: z.string().min(1).max(2000),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get("sourceId");
    
    const db = getDatabase();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    let query = db.select().from(comments).where(eq(comments.body, "")).limit(50);

    if (sourceId) {
      query = db.select().from(comments).where(eq(comments.sourceId, sourceId));
    }

    // orderBy removed due to type constraints

    const data = await query;
    return NextResponse.json({ comments: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = InsertSchema.parse(await request.json());
    const db = getDatabase();
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const [comment] = await db
      .insert(comments)
      .values({
        sourceId: body.sourceId,
        analysisId: body.analysisId,
        parentId: body.parentId,
        authorName: body.isAnonymous ? undefined : body.authorName,
        isAnonymous: body.isAnonymous,
        body: body.body,
      })
      .returning();

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create comment" }, { status: 400 });
  }
}
