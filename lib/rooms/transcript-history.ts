import "server-only";

import { asc, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db/client";
import { rooms, sources, transcriptSegments } from "@/lib/db/schema";

export type RoomTranscriptSegment = {
  id: string;
  text: string;
  language: string;
  startMs: number;
  endMs: number;
  speaker: string;
  final: true;
};

type NewRoomTranscriptSegment = Omit<RoomTranscriptSegment, "final">;

const state = globalThis as typeof globalThis & { __civicLensTranscriptHistory?: Map<string, Map<string, NewRoomTranscriptSegment>> };
const memory = state.__civicLensTranscriptHistory ?? new Map<string, Map<string, NewRoomTranscriptSegment>>();
state.__civicLensTranscriptHistory = memory;

async function resolveRoom(sourceKey: string) {
  const db = getDatabase();
  if (!db) return;
  const [source] = await db.select({ id: sources.id }).from(sources).where(eq(sources.canonicalKey, sourceKey)).limit(1);
  if (!source) return;
  return (await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.sourceId, source.id)).limit(1))[0];
}

export async function saveRoomTranscript(sourceKey: string, segment: NewRoomTranscriptSegment) {
  const db = getDatabase();
  if (!db) {
    const history = memory.get(sourceKey) ?? new Map<string, NewRoomTranscriptSegment>();
    history.set(segment.id, segment);
    memory.set(sourceKey, history);
    return { saved: true };
  }
  const room = await resolveRoom(sourceKey);
  if (!room) throw new Error("Room not found.");
  const inserted = await db.insert(transcriptSegments).values({
    roomId: room.id,
    externalId: segment.id,
    originalText: segment.text,
    language: segment.language,
    startMs: segment.startMs,
    endMs: segment.endMs,
    speaker: segment.speaker,
  }).onConflictDoNothing({ target: [transcriptSegments.roomId, transcriptSegments.externalId] }).returning({ id: transcriptSegments.id });
  return { saved: inserted.length > 0 };
}

export async function getRoomTranscript(sourceKey: string): Promise<RoomTranscriptSegment[]> {
  const db = getDatabase();
  if (!db) return [...(memory.get(sourceKey)?.values() ?? [])]
    .sort((a, b) => a.startMs - b.startMs)
    .map((segment) => ({ ...segment, final: true }));
  const room = await resolveRoom(sourceKey);
  if (!room) return [];
  const segments = await db.select().from(transcriptSegments)
    .where(eq(transcriptSegments.roomId, room.id))
    .orderBy(asc(transcriptSegments.startMs), asc(transcriptSegments.createdAt))
    .limit(1_000);
  return segments.map((segment) => ({
    id: segment.externalId || segment.id,
    text: segment.originalText,
    language: segment.language,
    startMs: segment.startMs,
    endMs: segment.endMs,
    speaker: segment.speaker || "Shared tab audio",
    final: true,
  }));
}
