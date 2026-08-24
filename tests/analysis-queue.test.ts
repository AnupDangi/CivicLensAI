import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { claimQueuedAnalysis, createAnalysis, getAnalysis } from "@/lib/analysis/repository";

describe("analysis queue recovery", () => {
  it("claims a resolving analysis once so polling retries cannot duplicate work", async () => {
    const source = {
      kind: "GENERIC_PAGE" as const,
      originalUrl: "https://example.com/queue-recovery",
      canonicalUrl: "https://example.com/queue-recovery",
      canonicalKey: `web:queue-recovery-${Date.now()}`,
    };
    const { record } = await createAnalysis(source, "auto", true);

    expect(await claimQueuedAnalysis(record.id)).toBe(true);
    expect(await claimQueuedAnalysis(record.id)).toBe(false);
    expect((await getAnalysis(record.id))?.stage).toBe("EXTRACTING");
  });
});
