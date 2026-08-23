import { NextResponse } from "next/server";
import { getAnalysis } from "@/lib/analysis/repository";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const analysis = await getAnalysis(id);
  if (!analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
  return NextResponse.json(analysis, { headers: { "cache-control": "no-store" } });
}
