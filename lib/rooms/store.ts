import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db/client";
import { rooms, participants, sources } from "@/lib/db/schema";
import { roomIdForSource } from "@/lib/source/normalize";
import type { NormalizedSource } from "@/lib/domain";

type RoomState={name:string;canonicalKey:string;hostCapabilityHash:string;createdAt:string};
const state=globalThis as typeof globalThis&{__civicLensRooms?:Map<string,RoomState>};
const memory=state.__civicLensRooms??new Map<string,RoomState>();state.__civicLensRooms=memory;

function visitorHash(visitorId:string){return createHash("sha256").update(`${process.env.HOST_TOKEN_SECRET||"development"}:${visitorId}`).digest("hex")}

export function liveKitRoomName(source: NormalizedSource): string { return `civic-${roomIdForSource(source)}`; }

export async function getOrCreateRoom(sourceInput:NormalizedSource,visitorId:string):Promise<{room:RoomState;role:"HOST"|"PARTICIPANT";reused:boolean}>{
  const hash=visitorHash(visitorId);const db=getDatabase();
  if(!db){let room=memory.get(sourceInput.canonicalKey);const reused=Boolean(room);if(!room){room={name:liveKitRoomName(sourceInput),canonicalKey:sourceInput.canonicalKey,hostCapabilityHash:hash,createdAt:new Date().toISOString()};memory.set(sourceInput.canonicalKey,room)}return {room,role:room.hostCapabilityHash===hash?"HOST":"PARTICIPANT",reused}}
  const [source]=await db.insert(sources).values({kind:sourceInput.kind,originalUrl:sourceInput.originalUrl,canonicalUrl:sourceInput.canonicalUrl,canonicalKey:sourceInput.canonicalKey,externalId:sourceInput.externalId,author:sourceInput.author,publishedAt:sourceInput.publishedAt?new Date(sourceInput.publishedAt):undefined}).onConflictDoUpdate({target:sources.canonicalKey,set:{canonicalUrl:sourceInput.canonicalUrl,originalUrl:sourceInput.originalUrl,updatedAt:new Date()}}).returning();
  let roomRow=(await db.select().from(rooms).where(eq(rooms.sourceId,source.id)).limit(1))[0];
  const reused=Boolean(roomRow);
  if(!roomRow){
    [roomRow]=await db.insert(rooms).values({sourceId:source.id,hostCapabilityHash:hash,title:`Civic room for ${new URL(sourceInput.canonicalUrl).hostname}`}).onConflictDoNothing({target:rooms.sourceId}).returning();
    // Another request may have created the canonical room between our select and insert.
    roomRow ??= (await db.select().from(rooms).where(eq(rooms.sourceId,source.id)).limit(1))[0];
  }
  if(!roomRow) throw new Error("Could not create or recover the Civic Room.");

  const identity=`guest-${visitorId}`;
  const role=roomRow.hostCapabilityHash===hash?"HOST":"PARTICIPANT";
  const existingParticipant=(await db.select({id:participants.id}).from(participants).where(and(eq(participants.roomId,roomRow.id),eq(participants.livekitIdentity,identity))).limit(1))[0];
  if(existingParticipant){
    await db.update(participants).set({lastSeenAt:sql`now()`,displayName:guestName(visitorId),role}).where(eq(participants.id,existingParticipant.id));
  }else{
    await db.insert(participants).values({roomId:roomRow.id,anonymousId:visitorId,livekitIdentity:identity,displayName:guestName(visitorId),role,joinedAt:sql`now()`,lastSeenAt:sql`now()`});
  }
  await db.update(rooms).set({lastActiveAt:sql`now()`}).where(eq(rooms.id,roomRow.id));
  const room:RoomState={name:liveKitRoomName(sourceInput),canonicalKey:sourceInput.canonicalKey,hostCapabilityHash:roomRow.hostCapabilityHash,createdAt:roomRow.createdAt.toISOString()};
  return {room,role,reused};
}

export function guestName(visitorId:string){let total=0;for(const char of visitorId)total+=char.charCodeAt(0);return `Guest ${String(total%1000).padStart(3,"0")}`}
export function newVisitorId():string{return randomUUID()}
