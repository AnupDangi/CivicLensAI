import { z } from "zod";
import { CLAIM_TYPES } from "@/lib/domain";

export const ClaimExtractionSchema = z.object({
  detectedLanguages: z.array(z.string()).min(1),
  claims: z.array(z.object({
    originalText: z.string().min(1),
    normalizedEnglish: z.string(),
    language: z.string().min(1),
    claimType: z.enum(CLAIM_TYPES),
    checkability: z.number().min(0).max(1),
    importance: z.number().min(0).max(1),
    countryCode: z.string().max(3),
    jurisdiction: z.string(),
    sourceReference: z.string(),
    searchQueries: z.array(z.string()).min(2).max(8),
    needsSocialSearch: z.boolean().default(false),
  })).max(12),
});

export const AssessmentSchema = z.object({
  verdict: z.enum(["SUPPORTED", "CONTRADICTED", "MISLEADING", "UNVERIFIED", "INSUFFICIENT_EVIDENCE"]),
  evidenceStrength: z.enum(["HIGH", "MEDIUM", "LOW"]),
  summary: z.string(),
  reasoning: z.array(z.string()).max(5),
  limitations: z.array(z.string()).max(5),
  evidenceUsed: z.array(z.object({
    evidenceId: z.string(),
    stance: z.enum(["SUPPORTS", "CONTRADICTS", "CONTEXT", "NEUTRAL"]),
  })),
  primarySourceAvailable: z.boolean(),
});

export type ExtractedClaims = z.infer<typeof ClaimExtractionSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
