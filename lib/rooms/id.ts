import type { NormalizedSource } from "@/lib/domain";

export function roomIdForCanonicalKey(canonicalKey: string): string {
  const [kind, identifier] = canonicalKey.split(":", 2);
  if (kind === "youtube" && identifier) return identifier;
  return `source-${canonicalKey.replace(":", "-")}`;
}

export function roomIdForSource(source: NormalizedSource): string {
  return roomIdForCanonicalKey(source.canonicalKey);
}

export function canonicalKeyForRoomId(roomId: string): string | undefined {
  if (/^[\w-]{6,}$/.test(roomId) && !roomId.startsWith("source-")) return `youtube:${roomId}`;
  const match = roomId.match(/^source-(youtube|x|instagram|reddit|tiktok|web)-([\w-]+)$/);
  return match ? `${match[1]}:${match[2]}` : undefined;
}
