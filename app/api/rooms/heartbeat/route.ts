import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db/client";
import { participants, rooms, sources } from "@/lib/db/schema";

const SourceKey = z.string().regex(/^(youtube|x|instagram|reddit|tiktok|web):[\w-]+$/);
const Body = z.object({ sourceKey: SourceKey, visitorId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const body = Body.parse(await request.json());
    const db = getDatabase();
    if (!db) return NextResponse.json({ ok: true });
    const [source] = await db.select().from(sources).where(eq(sources.canonicalKey, body.sourceKey)).limit(1);
    if (!source) return NextResponse.json({ ok: true });
    const [room] = await db.select().from(rooms).where(eq(rooms.sourceId, source.id)).limit(1);
    if (!room) return NextResponse.json({ ok: true });
    const identity = `guest-${body.visitorId}`;
    await db
      .update(participants)
      .set({ lastSeenAt: sql`now()` })
      .where(and(eq(participants.roomId, room.id), eq(participants.livekitIdentity, identity)));
    // prune stale participants (>5 min old) to keep counts accurate - but keep 1-min threshold for "active"
    // We don't delete, just let active filter handle it; cleanup job can delete old rows periodically
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceKey = searchParams.get("sourceKey");
  if (!sourceKey || !SourceKey.safeParse(sourceKey).success) return NextResponse.json({ active: 0 });
  const db = getDatabase();
  if (!db) return NextResponse.json({ active: 0 });
  try {
    const [source] = await db.select().from(sources).where(eq(sources.canonicalKey, sourceKey)).limit(1);
    if (!source) return NextResponse.json({ active: 0 });
    const [room] = await db.select().from(rooms).where(eq(rooms.sourceId, source.id)).limit(1);
    if (!room) return NextResponse.json({ active: 0 });
    const oneMinAgo = new Date(Date.now() - 60_000);
    const rows = await db.select().from(participants).where(and(eq(participants.roomId, room.id), eq(participants.lastSeenAt, participants.lastSeenAt))).limit(1000);
    // Use sql for gte if needed; fallback to JS filter for active
    const active = rows.filter((r) => r.lastSeenAt && r.lastSeenAt.getTime() > oneMinAgo.getTime()).length;
    return NextResponse.json({ active, total: rows.length, roomId: room.id });
  } catch {
    return NextResponse.json({ active: 0 });
  }
}
