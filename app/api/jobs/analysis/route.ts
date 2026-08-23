import { NextResponse } from "next/server";
import { z } from "zod";
import { runAnalysis } from "@/lib/analysis/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

const Schema=z.object({analysisId:z.string().uuid()});
export async function POST(request:Request){const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");if(!process.env.TRIGGER_SECRET_KEY||token!==process.env.TRIGGER_SECRET_KEY)return NextResponse.json({error:"Unauthorized."},{status:401});try{const {analysisId}=Schema.parse(await request.json());await runAnalysis(analysisId);return NextResponse.json({ok:true,analysisId});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Job failed."},{status:400})}}
