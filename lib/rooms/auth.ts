import "server-only";
import { jwtVerify, SignJWT } from "jose";

function secret(): Uint8Array {
  const value = process.env.HOST_TOKEN_SECRET || "development-only-civiclens-host-secret";
  return new TextEncoder().encode(value);
}

export async function signHostCapability(roomName: string, visitorId: string): Promise<string> {
  return new SignJWT({ roomName, visitorId, role: "HOST" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("4h").sign(secret());
}

export async function verifyHostCapability(token: string, roomName: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "HOST" && payload.roomName === roomName;
  } catch {
    return false;
  }
}
