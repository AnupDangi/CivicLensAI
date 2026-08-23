import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { rateLimit, requestIdentity } from "@/lib/http/rate-limit";

const allowed = ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp4", "video/mp4", "video/webm", "text/plain"];

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Upload storage is not configured. Paste the source text instead." }, { status: 503 });
  const limit = rateLimit(`upload:${requestIdentity(request)}`, 8, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({ allowedContentTypes: allowed, maximumSizeInBytes: 250 * 1024 * 1024, tokenPayload: JSON.stringify({ deleteAfter: Date.now() + 86_400_000 }) }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload initialization failed." }, { status: 400 });
  }
}
