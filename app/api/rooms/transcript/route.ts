import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyHostCapability } from "@/lib/rooms/auth";
import { roomIdForCanonicalKey } from "@/lib/source/normalize";
import { getRoomTranscript, saveRoomTranscript } from "@/lib/rooms/transcript-history";

const SourceKey = z.string().regex(/^(youtube|x|instagram|reddit|tiktok|web):[\w-]+$/);
const Segment = z.object({
  id: z.string().min(1).max(160),
  text: z.string().min(1).max(8_000),
  language: z.string().min(2).max(35).default("und"),
  startMs: z.number().int().min(0).max(86_400_000),
  endMs: z.number().int().min(0).max(86_400_000),
  speaker: z.string().min(1).max(160).default("Shared tab audio"),
});

export async function GET(request: Request) {
  try {
    const sourceKey = SourceKey.parse(new URL(request.url).searchParams.get("sourceKey"));
    return NextResponse.json({ segments: await getRoomTranscript(sourceKey) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the room transcript." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = z.object({ sourceKey: SourceKey, segment: Segment }).parse(await request.json());
    const hostCapability = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!hostCapability || !(await verifyHostCapability(hostCapability, `civic-${roomIdForCanonicalKey(body.sourceKey)}`))) {
      return NextResponse.json({ error: "Host capability required to save the room transcript." }, { status: 403 });
    }
    return NextResponse.json(await saveRoomTranscript(body.sourceKey, body.segment));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the room transcript." }, { status: 400 });
  }
}
