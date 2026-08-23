import { NextResponse } from "next/server";
import { z } from "zod";
import { factCheckArtifacts } from "@/lib/factcheck/engine";
import { rateLimit, requestIdentity } from "@/lib/http/rate-limit";
import { analyzeUploadedArtifact } from "@/lib/media/analyze";

const RequestSchema = z.discriminatedUnion("mode",[
  z.object({mode:z.literal("TEXT").default("TEXT"),originalText:z.string().min(10).max(5_000),sourceUrl:z.string().url().optional(),language:z.string().min(2).max(35).default("und")}),
  z.object({mode:z.literal("UPLOAD"),artifactUrl:z.string().url(),artifactKind:z.enum(["IMAGE","AUDIO","VIDEO"]),mimeType:z.string().max(120).optional()}),
]);

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const limit = rateLimit(`claim:${requestIdentity(request)}`, 12, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many checks. Try again shortly." }, { status: 429 });
  try {
    const body = RequestSchema.parse(await request.json());
    const artifact=body.mode==="UPLOAD"
      ?await analyzeUploadedArtifact({url:body.artifactUrl,kind:body.artifactKind,mimeType:body.mimeType})
      :{kind:"TEXT" as const,sourceUrl:body.sourceUrl||"manual://claim",originalLanguage:body.language,originalText:body.originalText,extractionMethod:"manual",coverage:"COMPLETE" as const};
    const checked = await factCheckArtifacts([artifact], "auto");
    return NextResponse.json(checked);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The claim could not be checked." }, { status: 400 });
  }
}
