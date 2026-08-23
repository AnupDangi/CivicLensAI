import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db/client";
import { rooms, participants, sources } from "@/lib/db/schema";

type RoomState={name:string;videoId:string;hostCapabilityHash:string;createdAt:string};
const state=globalThis as typeof globalThis&{__civicLensRooms?:Map<string,RoomState>};
const memory=state.__civicLensRooms??new Map<string,RoomState>();state.__civicLensRooms=memory;

function visitorHash(visitorId:string){return createHash("sha256").update(`${process.env.HOST_TOKEN_SECRET||"development"}:${visitorId}`).digest("hex")}

export async function getOrCreateRoom(videoId:string,visitorId:string):Promise<{room:RoomState;role:"HOST"|"PARTICIPANT";reused:boolean}>{
  const hash=visitorHash(visitorId);const db=getDatabase();
  if(!db){let room=memory.get(videoId);const reused=Boolean(room);if(!room){room={name:`civic-${videoId}`,videoId,hostCapabilityHash:hash,createdAt:new Date().toISOString()};memory.set(videoId,room)}return {room,role:room.hostCapabilityHash===hash?"HOST":"PARTICIPANT",reused}}
  const canonicalKey=`youtube:${videoId}`;const canonicalUrl=`https://www.youtube.com/watch?v=${videoId}`;
  const [source]=await db.insert(sources).values({kind:"YOUTUBE",originalUrl:canonicalUrl,canonicalUrl,canonicalKey,externalId:videoId}).onConflictDoUpdate({target:sources.canonicalKey,set:{canonicalUrl,updatedAt:new Date()}}).returning();
  let roomRow=(await db.select().from(rooms).where(eq(rooms.sourceId,source.id)).limit(1))[0];
  const reused=Boolean(roomRow);
  if(!roomRow){
    [roomRow]=await db.insert(rooms).values({sourceId:source.id,hostCapabilityHash:hash,title:`YouTube room ${videoId}`}).onConflictDoNothing({target:rooms.sourceId}).returning();
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
  const room:RoomState={name:`civic-${videoId}`,videoId,hostCapabilityHash:roomRow.hostCapabilityHash,createdAt:roomRow.createdAt.toISOString()};
  return {room,role,reused};
}

export function guestName(visitorId:string){let total=0;for(const char of visitorId)total+=char.charCodeAt(0);return `Guest ${String(total%1000).padStart(3,"0")}`}
export function newVisitorId():string{return randomUUID()}
