import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import type { AnalysisResult, ContentArtifact, EvidenceItem } from "@/lib/domain";

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: varchar("kind", { length: 32 }).notNull(),
  originalUrl: text("original_url").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  canonicalKey: varchar("canonical_key", { length: 180 }).notNull(),
  externalId: varchar("external_id", { length: 128 }),
  author: text("author"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("sources_canonical_key_uq").on(table.canonicalKey)]);

export const analysisRuns = pgTable("analysis_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  displayLanguage: varchar("display_language", { length: 35 }).notNull().default("auto"),
  stage: varchar("stage", { length: 40 }).notNull().default("RESOLVING"),
  progress: integer("progress").notNull().default(5),
  fixture: boolean("fixture").notNull().default(false),
  resultJson: jsonb("result_json").$type<AnalysisResult>(),
  failureReason: text("failure_reason"),
  contentHash: varchar("content_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("analysis_source_created_idx").on(table.sourceId, table.createdAt)]);

export const contentArtifacts = pgTable("content_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  analysisId: uuid("analysis_id").notNull().references(() => analysisRuns.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 24 }).notNull(),
  sourceUrl: text("source_url").notNull(),
  originalLanguage: varchar("original_language", { length: 35 }).notNull().default("und"),
  originalText: text("original_text"),
  storageKey: text("storage_key"),
  extractionMethod: varchar("extraction_method", { length: 80 }).notNull(),
  coverage: varchar("coverage", { length: 20 }).notNull(),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  deleteAfter: timestamp("delete_after", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transcriptSegments = pgTable("transcript_segments", {
  id: uuid("id").defaultRandom().primaryKey(),
  analysisId: uuid("analysis_id").references(() => analysisRuns.id, { onDelete: "cascade" }),
  roomId: uuid("room_id"),
  originalText: text("original_text").notNull(),
  language: varchar("language", { length: 35 }).notNull().default("und"),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  speaker: text("speaker"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey(),
  analysisId: uuid("analysis_id").notNull().references(() => analysisRuns.id, { onDelete: "cascade" }),
  originalText: text("original_text").notNull(),
  normalizedEnglish: text("normalized_english"),
  language: varchar("language", { length: 35 }).notNull(),
  claimType: varchar("claim_type", { length: 32 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }),
  jurisdiction: text("jurisdiction"),
  sourceReference: text("source_reference"),
  searchQueries: jsonb("search_queries").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  snippet: text("snippet").notNull(),
  sourceTier: integer("source_tier").notNull(),
  sourceType: varchar("source_type", { length: 48 }).notNull(),
  stance: varchar("stance", { length: 24 }).notNull(),
  matchedBecause: jsonb("matched_because").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).defaultNow().notNull(),
});

export const factChecks = pgTable("fact_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  verdict: varchar("verdict", { length: 40 }).notNull(),
  evidenceStrength: varchar("evidence_strength", { length: 16 }).notNull(),
  primarySourceAvailable: boolean("primary_source_available").notNull(),
  summary: text("summary").notNull(),
  reasoning: jsonb("reasoning").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  limitations: jsonb("limitations").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  model: text("model"),
  promptVersion: varchar("prompt_version", { length: 40 }).notNull().default("v0.1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  hostCapabilityHash: varchar("host_capability_hash", { length: 128 }).notNull(),
  title: text("title"),
  isLive: boolean("is_live").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("rooms_source_uq").on(table.sourceId)]);

export const participants = pgTable("participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  anonymousId: uuid("anonymous_id").notNull(),
  livekitIdentity: varchar("livekit_identity", { length: 160 }).notNull(),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("PARTICIPANT"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id").references(() => participants.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ArtifactInsert = typeof contentArtifacts.$inferInsert & { metadata?: ContentArtifact["metadata"] };
export type EvidenceInsert = typeof evidence.$inferInsert & { matchedBecause: EvidenceItem["matchedBecause"] };

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "cascade" }),
  analysisId: uuid("analysis_id").references(() => analysisRuns.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  authorName: varchar("author_name", { length: 80 }),
  isAnonymous: boolean("is_anonymous").notNull().default(true),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
