import { NextResponse } from "next/server";
import { z } from "zod";
import { analysisDestination, normalizeSourceUrl, SourceUrlError } from "@/lib/source/normalize";

const RequestSchema = z.object({ url: z.string().max(2048) });

export async function POST(request: Request) {
  try {
    const body = RequestSchema.parse(await request.json());
    const source = normalizeSourceUrl(body.url);
    return NextResponse.json({ source, destination: analysisDestination(source), supported: true });
  } catch (error) {
    const message = error instanceof SourceUrlError ? error.message : error instanceof z.ZodError ? "Enter a valid URL." : "The source URL could not be resolved.";
    const code = error instanceof SourceUrlError ? error.code : "INVALID_REQUEST";
    return NextResponse.json({ error: message, code }, { status: 400 });
  }
}
