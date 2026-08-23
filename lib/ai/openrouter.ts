import "server-only";
import { z, type ZodType } from "zod";

type ModelTier = "fast" | "deep";
export type OpenRouterContent = string | Array<
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
>;

function currentModelId(configured: string | undefined, tier: ModelTier): string {
  const fallback = tier === "deep" ? "google/gemini-3.1-pro-preview" : "google/gemini-3.7-flash";
  const value = configured || fallback;
  // Accept the original V0 and rolling-alias values so existing Vercel projects
  // move to OpenRouter's current concrete, structured-output-capable models.
  if (["google/gemini-flash-latest", "~google/gemini-flash-latest"].includes(value)) return "google/gemini-3.7-flash";
  if (["google/gemini-pro-latest", "~google/gemini-pro-latest"].includes(value)) return "google/gemini-3.1-pro-preview";
  return value;
}

function providerSchema<T>(schema: ZodType<T>): Record<string, unknown> {
  // Gemini's structured-output endpoint accepts the JSON Schema subset used by
  // OpenAPI. Zod emits draft metadata, defaults, and string-length constraints
  // outside Google's accepted subset; strip only those schema keywords.
  const unsupported = new Set([
    "$schema", "default", "minLength", "maxLength", "pattern", "const", "examples",
    // Current Google providers intermittently reject numeric/array constraints
    // on nested schemas. Zod validates these limits again after generation.
    "minItems", "maxItems", "minimum", "maximum",
  ]);
  return JSON.parse(JSON.stringify(z.toJSONSchema(schema), (key, value) =>
    unsupported.has(key) ? undefined : value,
  )) as Record<string, unknown>;
}

export async function structuredCompletion<T>(input: {
  schema: ZodType<T>;
  schemaName: string;
  system: string;
  user: OpenRouterContent;
  tier?: ModelTier;
}): Promise<T> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured.");
  const tier = input.tier === "deep" ? "deep" : "fast";
  const model = currentModelId(tier === "deep" ? process.env.OPENROUTER_DEEP_MODEL : process.env.OPENROUTER_FAST_MODEL, tier);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "x-title": "CivicLens",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
      response_format: {
        type: "json_schema",
        json_schema: { name: input.schemaName, schema: providerSchema(input.schema) },
      },
    }),
    signal: AbortSignal.timeout(input.tier === "deep" ? 60_000 : 35_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 320);
    throw new Error(`OpenRouter returned ${response.status}${detail ? `: ${detail}` : "."}`);
  }
  const payload = await response.json() as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string } }>;
    error?: { message?: string };
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    const reason = payload.error?.message || payload.choices?.[0]?.message?.refusal || payload.choices?.[0]?.finish_reason;
    throw new Error(`OpenRouter returned no structured response${reason ? ` (${reason})` : "."}`);
  }
  return input.schema.parse(JSON.parse(content));
}
