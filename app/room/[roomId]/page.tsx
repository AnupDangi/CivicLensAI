import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CivicRoom } from "@/components/civic-room";

export const metadata:Metadata={title:"Civic Room"};
export default async function RoomPage({params,searchParams}:{params:Promise<{roomId:string}>;searchParams:Promise<{analysis?:string}>}){const {roomId}=await params;const {analysis}=await searchParams;if(!/^[\w-]{6,}$/.test(roomId))notFound();return <CivicRoom videoId={roomId} initialAnalysisId={analysis}/>}
