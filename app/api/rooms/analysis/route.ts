import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestAnalysisForSource } from "@/lib/analysis/repository";

const SourceKey = z.string().regex(/^(youtube|x|instagram|reddit|tiktok|web):[\w-]+$/);

export async function GET(request: Request) {
  try {
    const sourceKey = SourceKey.parse(new URL(request.url).searchParams.get("sourceKey"));
    return NextResponse.json({ analysis: await getLatestAnalysisForSource(sourceKey) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load room analysis." }, { status: 400 });
  }
}
