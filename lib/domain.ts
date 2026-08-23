export const SOURCE_KINDS = [
  "YOUTUBE",
  "X_POST",
  "INSTAGRAM_POST",
  "REDDIT_POST",
  "TIKTOK_POST",
  "ARTICLE",
  "GENERIC_PAGE",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export type ArtifactKind = "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "LINKED_PAGE";
export type CoverageState = "COMPLETE" | "PARTIAL" | "FAILED";

export type NormalizedSource = {
  kind: SourceKind;
  originalUrl: string;
  canonicalUrl: string;
  canonicalKey: string;
  externalId?: string;
  author?: string;
  publishedAt?: string;
};

export type ContentArtifact = {
  id?: string;
  kind: ArtifactKind;
  sourceUrl: string;
  originalLanguage: string;
  originalText?: string;
  storageKey?: string;
  extractionMethod: string;
  coverage: CoverageState;
  failureReason?: string;
  metadata?: Record<string, unknown>;
};

export const ANALYSIS_STAGES = [
  "RESOLVING",
  "EXTRACTING",
  "TRANSCRIBING",
  "EXTRACTING_CLAIMS",
  "SEARCHING_OFFICIAL",
  "SEARCHING_FACT_CHECKS",
  "SEARCHING_WEB",
  "EVALUATING",
  "COMPLETE",
  "PARTIAL",
  "FAILED",
] as const;

export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

export const CLAIM_TYPES = [
  "LEGAL",
  "POLITICAL",
  "ECONOMIC",
  "ELECTION",
  "HEALTH",
  "SCIENCE",
  "HISTORICAL",
  "STATISTICAL",
  "QUOTE",
  "EVENT",
  "GENERAL",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];
export type Verdict =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "MISLEADING"
  | "UNVERIFIED"
  | "INSUFFICIENT_EVIDENCE";

export type EvidenceItem = {
  id: string;
  url: string;
  title: string;
  publisher: string;
  snippet: string;
  sourceTier: number;
  sourceType: string;
  stance: "SUPPORTS" | "CONTRADICTS" | "CONTEXT" | "NEUTRAL";
  matchedBecause: string[];
  publishedAt?: string;
};

export type ClaimResult = {
  id: string;
  originalText: string;
  normalizedEnglish?: string;
  language: string;
  claimType: ClaimType;
  countryCode?: string;
  jurisdiction?: string;
  sourceReference?: string;
  searchQueries: string[];
  verdict: Verdict;
  evidenceStrength: "HIGH" | "MEDIUM" | "LOW";
  primarySourceAvailable: boolean;
  summary: string;
  reasoning: string[];
  limitations: string[];
  evidence: EvidenceItem[];
};

export type AnalysisResult = {
  source: NormalizedSource;
  title: string;
  author?: string;
  displayLanguage: string;
  detectedLanguages: string[];
  artifacts: ContentArtifact[];
  claims: ClaimResult[];
  limitations: string[];
  fixture: boolean;
  completedAt: string;
};

export type AnalysisRecord = {
  id: string;
  source: NormalizedSource;
  displayLanguage: string;
  stage: AnalysisStage;
  progress: number;
  result?: AnalysisResult;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type ExtractedSource = {
  source: NormalizedSource;
  title: string;
  author?: string;
  artifacts: ContentArtifact[];
  limitations: string[];
};
