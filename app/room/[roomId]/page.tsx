import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CivicRoom } from "@/components/civic-room";
import { getAnalysis, getLatestAnalysisForSource } from "@/lib/analysis/repository";
import { canonicalKeyForRoomId } from "@/lib/source/normalize";

export const metadata:Metadata={title:"Civic Room"};
export default async function RoomPage({params,searchParams}:{params:Promise<{roomId:string}>;searchParams:Promise<{analysis?:string}>}){
  const {roomId}=await params;
  const {analysis}=await searchParams;
  const canonicalKey=canonicalKeyForRoomId(roomId);
  if(!canonicalKey)notFound();
  const requested=analysis?await getAnalysis(analysis):undefined;
  const record=requested?.source.canonicalKey===canonicalKey?requested:await getLatestAnalysisForSource(canonicalKey);
  if(!record)notFound();
  return <CivicRoom source={record.source} roomId={roomId} initialAnalysisId={analysis||record.id}/>;
}
