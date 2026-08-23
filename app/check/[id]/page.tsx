import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalysisView } from "@/components/analysis-view";
import { getAnalysis } from "@/lib/analysis/repository";

export const metadata:Metadata={title:"Evidence check"};
export default async function CheckPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const record=await getAnalysis(id);if(!record)notFound();return <AnalysisView analysisId={id} initialRecord={record}/>}
