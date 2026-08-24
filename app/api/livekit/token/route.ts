import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateRoom, guestName } from "@/lib/rooms/store";
import { signHostCapability } from "@/lib/rooms/auth";
import { ensureTranscriberDispatch } from "@/lib/rooms/transcriber";
import { normalizeSourceUrl } from "@/lib/source/normalize";

const RequestSchema = z.object({ sourceUrl: z.string().url().max(2_048), visitorId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || !process.env.LIVEKIT_URL) {
      return NextResponse.json({ configured: false, error: "LiveKit is not configured; room preview remains available." }, { status: 503 });
    }
    const body = RequestSchema.parse(await request.json());
    const source = normalizeSourceUrl(body.sourceUrl);
    const { room, role, reused } = await getOrCreateRoom(source, body.visitorId);
    let transcription: { ready: boolean; error?: string } = { ready: true };
    // The host is the only participant allowed to share tab audio, so it is
    // also the only browser allowed to create the room's single transcription job.
    if (role === "HOST") {
      try {
        await ensureTranscriberDispatch(room.name);
      } catch (error) {
        // Do not prevent people from using the room when the worker deployment is
        // temporarily unavailable, but make the missing live captions explicit.
        transcription = { ready: false, error: error instanceof Error ? error.message : "The transcription worker could not be started." };
        console.error("Could not dispatch CivicLens transcriber", { room: room.name, error });
      }
    }
    const identity = `guest-${body.visitorId}`;
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity, name: guestName(body.visitorId), metadata: JSON.stringify({ role }) });
    token.addGrant({ roomJoin: true, room: room.name, canPublish: true, canPublishData: true, canSubscribe: true, roomAdmin: role === "HOST" });
    return NextResponse.json({ configured: true, token: await token.toJwt(), url: process.env.LIVEKIT_URL, roomName: room.name, role, reused, transcription, hostCapability: role === "HOST" ? await signHostCapability(room.name, body.visitorId) : undefined, displayName: guestName(body.visitorId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not join the room." }, { status: 400 });
  }
}
