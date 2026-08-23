import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateRoom, guestName } from "@/lib/rooms/store";
import { signHostCapability } from "@/lib/rooms/auth";

const RequestSchema = z.object({ videoId: z.string().regex(/^[\w-]{6,}$/), visitorId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || !process.env.LIVEKIT_URL) {
      return NextResponse.json({ configured: false, error: "LiveKit is not configured; room preview remains available." }, { status: 503 });
    }
    const body = RequestSchema.parse(await request.json());
    const { room, role, reused } = await getOrCreateRoom(body.videoId, body.visitorId);
    const identity = `guest-${body.visitorId}`;
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity, name: guestName(body.visitorId), metadata: JSON.stringify({ role }) });
    token.addGrant({ roomJoin: true, room: room.name, canPublish: true, canPublishData: true, canSubscribe: true, roomAdmin: role === "HOST" });
    return NextResponse.json({ configured: true, token: await token.toJwt(), url: process.env.LIVEKIT_URL, roomName: room.name, role, reused, hostCapability: role === "HOST" ? await signHostCapability(room.name, body.visitorId) : undefined, displayName: guestName(body.visitorId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not join the room." }, { status: 400 });
  }
}
