import { describe,expect,it } from "vitest";
import { AssessmentSchema,ClaimExtractionSchema } from "@/lib/factcheck/schemas";

describe("multilingual fact-check contracts",()=>{
  it("preserves mixed-language claims and bilingual queries",()=>{
    const result=ClaimExtractionSchema.parse({detectedLanguages:["ne","en"],claims:[{originalText:"नेपालको मुद्रास्फीति १५ प्रतिशत छ।",normalizedEnglish:"Nepal's inflation is 15 percent.",language:"ne",claimType:"STATISTICAL",checkability:.95,importance:.8,countryCode:"NP",jurisdiction:"Nepal",sourceReference:"",searchQueries:["नेपाल मुद्रास्फीति १५ प्रतिशत","Nepal inflation 15 percent"]}]});
    expect(result.claims[0].originalText).toContain("नेपाल");
    expect(result.claims[0].searchQueries).toHaveLength(2);
  });

  it("rejects unsupported verdict labels",()=>{
    expect(()=>AssessmentSchema.parse({verdict:"TRUE",evidenceStrength:"HIGH",summary:"x",reasoning:[],limitations:[],evidenceUsed:[],primarySourceAvailable:false})).toThrow();
  });
});
