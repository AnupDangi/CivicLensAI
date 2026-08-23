import type { ClaimType } from "@/lib/domain";

export type OfficialSource = {
  id: string;
  name: string;
  domains: string[];
  categories: ClaimType[];
  priority: number;
};

export const SOURCE_REGISTRY: Record<string, OfficialSource[]> = {
  NP: [
    { id: "np-law-commission", name: "Nepal Law Commission", domains: ["lawcommission.gov.np"], categories: ["LEGAL", "POLITICAL"], priority: 100 },
    { id: "np-parliament", name: "Federal Parliament of Nepal", domains: ["parliament.gov.np", "hr.parliament.gov.np", "na.parliament.gov.np"], categories: ["LEGAL", "POLITICAL", "ELECTION"], priority: 100 },
    { id: "np-supreme-court", name: "Supreme Court of Nepal", domains: ["supremecourt.gov.np"], categories: ["LEGAL"], priority: 100 },
    { id: "np-election", name: "Election Commission Nepal", domains: ["election.gov.np"], categories: ["ELECTION", "POLITICAL"], priority: 100 },
    { id: "np-central-bank", name: "Nepal Rastra Bank", domains: ["nrb.org.np"], categories: ["ECONOMIC", "STATISTICAL"], priority: 100 },
  ],
  IN: [
    { id: "in-laws", name: "India Code", domains: ["indiacode.nic.in"], categories: ["LEGAL"], priority: 100 },
    { id: "in-election", name: "Election Commission of India", domains: ["eci.gov.in"], categories: ["ELECTION", "POLITICAL"], priority: 100 },
    { id: "in-statistics", name: "Ministry of Statistics and Programme Implementation", domains: ["mospi.gov.in"], categories: ["STATISTICAL", "ECONOMIC"], priority: 100 },
    { id: "in-pib", name: "Press Information Bureau", domains: ["pib.gov.in"], categories: ["POLITICAL", "EVENT", "GENERAL"], priority: 90 },
  ],
  US: [
    { id: "us-congress", name: "Congress.gov", domains: ["congress.gov"], categories: ["LEGAL", "POLITICAL"], priority: 100 },
    { id: "us-courts", name: "Supreme Court of the United States", domains: ["supremecourt.gov"], categories: ["LEGAL"], priority: 100 },
    { id: "us-data", name: "Data.gov", domains: ["data.gov"], categories: ["STATISTICAL", "ECONOMIC", "SCIENCE"], priority: 95 },
  ],
  GB: [
    { id: "uk-legislation", name: "UK Legislation", domains: ["legislation.gov.uk"], categories: ["LEGAL"], priority: 100 },
    { id: "uk-parliament", name: "UK Parliament", domains: ["parliament.uk"], categories: ["POLITICAL", "LEGAL"], priority: 100 },
    { id: "uk-ons", name: "Office for National Statistics", domains: ["ons.gov.uk"], categories: ["STATISTICAL", "ECONOMIC"], priority: 100 },
  ],
  GLOBAL: [
    { id: "who", name: "World Health Organization", domains: ["who.int"], categories: ["HEALTH", "SCIENCE"], priority: 95 },
    { id: "un", name: "United Nations", domains: ["un.org"], categories: ["POLITICAL", "EVENT", "GENERAL"], priority: 90 },
    { id: "world-bank", name: "World Bank", domains: ["worldbank.org"], categories: ["ECONOMIC", "STATISTICAL"], priority: 90 },
    { id: "imf", name: "International Monetary Fund", domains: ["imf.org"], categories: ["ECONOMIC", "STATISTICAL"], priority: 90 },
  ],
};

export function officialSources(countryCode: string | undefined, claimType: ClaimType): OfficialSource[] {
  const local = countryCode ? SOURCE_REGISTRY[countryCode] ?? [] : [];
  return [...local, ...SOURCE_REGISTRY.GLOBAL]
    .filter((source) => source.categories.includes(claimType) || claimType === "GENERAL")
    .sort((a, b) => b.priority - a.priority);
}
