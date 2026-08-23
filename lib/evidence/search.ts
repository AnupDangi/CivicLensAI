import "server-only";
import { randomUUID } from "node:crypto";
import type { ClaimType, EvidenceItem } from "@/lib/domain";
import { officialSources } from "@/lib/evidence/registry";
import { searchSocialEvidence } from "@/lib/evidence/xpoz";

type SearchCandidate = Omit<EvidenceItem, "id" | "stance">;

async function searchTavily(query: string, domains?: string[]): Promise<SearchCandidate[]> {
  if (!process.env.TAVILY_API_KEY) return [];
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, include_domains: domains, max_results: 5, search_depth: "advanced" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Evidence search returned ${response.status}.`);
  const data = await response.json() as { results?: Array<{ url: string; title: string; content: string; published_date?: string }> };
  return (data.results ?? []).map((result) => ({
    url: result.url,
    title: result.title,
    publisher: new URL(result.url).hostname.replace(/^www\./, ""),
    snippet: result.content.slice(0, 600),
    sourceTier: domains?.length ? 1 : 4,
    sourceType: domains?.length ? "PRIMARY_INSTITUTION" : "WEB",
    matchedBecause: domains?.length ? ["official registry domain", "claim and jurisdiction match"] : ["claim search match"],
    publishedAt: result.published_date,
  }));
}

async function searchGoogleFactChecks(query: string): Promise<SearchCandidate[]> {
  if (!process.env.GOOGLE_FACT_CHECK_API_KEY) return [];
  const endpoint = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("languageCode", "en");
  endpoint.searchParams.set("pageSize", "5");
  endpoint.searchParams.set("key", process.env.GOOGLE_FACT_CHECK_API_KEY);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) return [];
  const data = await response.json() as { claims?: Array<{ text?: string; claimReview?: Array<{ url?: string; title?: string; publisher?: { name?: string }; textualRating?: string; reviewDate?: string }> }> };
  return (data.claims ?? []).flatMap((claim) => (claim.claimReview ?? []).flatMap((review) => review.url ? [{
    url: review.url,
    title: review.title || claim.text || "Existing fact check",
    publisher: review.publisher?.name || new URL(review.url).hostname,
    snippet: review.textualRating ? `Published rating: ${review.textualRating}` : "Professional fact-check review",
    sourceTier: 3,
    sourceType: "PROFESSIONAL_FACT_CHECKER",
    matchedBecause: ["Google Fact Check match", "similar normalized claim"],
    publishedAt: review.reviewDate,
  }] : []));
}

function deduplicate(candidates: SearchCandidate[]): SearchCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    try {
      const url = new URL(candidate.url);
      url.hash = "";
      const key = url.toString().replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    } catch {
      return false;
    }
  });
}

export async function retrieveEvidence(input: {
  queries: string[];
  countryCode?: string;
  claimType: ClaimType;
  needsSocialSearch?: boolean;
}): Promise<EvidenceItem[]> {
  const registry = officialSources(input.countryCode, input.claimType).slice(0, 6);
  const domains = registry.flatMap((source) => source.domains);
  const primaryQuery = input.queries[0];
  const [official, factChecks, social, ...webGroups] = await Promise.all([
    searchTavily(primaryQuery, domains).catch(() => []),
    searchGoogleFactChecks(primaryQuery).catch(() => []),
    input.needsSocialSearch?searchSocialEvidence(primaryQuery).catch(()=>[]):Promise.resolve([]),
    ...input.queries.slice(0, 3).map((query) => searchTavily(query).catch(() => [])),
  ]);
  return deduplicate([...official, ...factChecks, ...webGroups.flat(),...social])
    .sort((a, b) => a.sourceTier - b.sourceTier)
    .slice(0, 12)
    .map((candidate) => ({ ...candidate, id: randomUUID(), stance: "NEUTRAL" }));
}
