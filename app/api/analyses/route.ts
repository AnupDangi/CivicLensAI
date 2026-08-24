import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createAnalysis } from "@/lib/analysis/repository";
import { runAnalysis } from "@/lib/analysis/pipeline";
import { rateLimit, requestIdentity } from "@/lib/http/rate-limit";
import { normalizeSourceUrl, roomIdForSource, SourceUrlError } from "@/lib/source/normalize";

const RequestSchema = z.object({
  url: z.string().max(2048),
  refresh: z.boolean().default(false),
});

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const limit = rateLimit(`analysis:${requestIdentity(request)}`, 8, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many analyses. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
  try {
    const body = RequestSchema.parse(await request.json());
    const source = normalizeSourceUrl(body.url);
    const { record, reused } = await createAnalysis(source, "auto", body.refresh);
    if (!reused) {
      if (process.env.TRIGGER_WEBHOOK_URL && process.env.TRIGGER_SECRET_KEY) {
        after(async () => {
          const response = await fetch(process.env.TRIGGER_WEBHOOK_URL!, { method: "POST", headers: { authorization: `Bearer ${process.env.TRIGGER_SECRET_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ analysisId: record.id }) });
          if (!response.ok) await runAnalysis(record.id);
        });
      } else {
        after(() => runAnalysis(record.id));
      }
    }
    const destination = `/room/${roomIdForSource(source)}?analysis=${record.id}`;
    return NextResponse.json({ analysisId: record.id, resultUrl: `/check/${record.id}`, destination, status: record.stage, reused }, { status: 202 });
  } catch (error) {
    const message = error instanceof SourceUrlError ? error.message : error instanceof z.ZodError ? "Check the submitted URL." : "The analysis could not be started.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
