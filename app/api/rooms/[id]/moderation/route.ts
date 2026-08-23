import { RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyHostCapability } from "@/lib/rooms/auth";

const RequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("REMOVE"), participantIdentity: z.string().min(1) }),
  z.object({ action: z.literal("MUTE"), participantIdentity: z.string().min(1), trackSid: z.string().min(1) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: roomName } = await context.params;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!(await verifyHostCapability(token, roomName))) return NextResponse.json({ error: "Host capability required." }, { status: 403 });
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return NextResponse.json({ error: "LiveKit is not configured." }, { status: 503 });
  try {
    const body = RequestSchema.parse(await request.json());
    const service = new RoomServiceClient(process.env.LIVEKIT_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
    if (body.action === "REMOVE") await service.removeParticipant(roomName, body.participantIdentity);
    else await service.mutePublishedTrack(roomName, body.participantIdentity, body.trackSid, true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Moderation action failed." }, { status: 400 });
  }
}
