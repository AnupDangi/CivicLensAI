import { describe,expect,it } from "vitest";
import { officialSources } from "@/lib/evidence/registry";

describe("official source registry",()=>{
  it("routes Nepal legal claims to primary legal sources",()=>{
    const sources=officialSources("NP","LEGAL");
    expect(sources[0].priority).toBe(100);
    expect(sources.flatMap((item)=>item.domains)).toContain("lawcommission.gov.np");
  });

  it("falls back to global health institutions",()=>{
    expect(officialSources("ZZ","HEALTH").some((item)=>item.domains.includes("who.int"))).toBe(true);
  });
});
