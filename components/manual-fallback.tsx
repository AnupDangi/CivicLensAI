"use client";
import { useState } from "react";
import { upload } from "@vercel/blob/client";
import type { ClaimResult } from "@/lib/domain";
import { FactCard } from "@/components/fact-card";
import { browserUuid } from "@/lib/client-id";

export function ManualFallback(){
  const [open,setOpen]=useState(false); const [text,setText]=useState(""); const [file,setFile]=useState<File>(); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [result,setResult]=useState<ClaimResult>();
  async function check(){setBusy(true);setError("");try{let payload:Record<string,unknown>={mode:"TEXT",originalText:text,language:"und"};if(file){const stored=await upload(`civiclens/${browserUuid()}-${file.name}`,file,{access:"public",handleUploadUrl:"/api/uploads/presign",multipart:file.size>10*1024*1024});const kind=file.type.startsWith("image/")?"IMAGE":file.type.startsWith("audio/")?"AUDIO":"VIDEO";payload={mode:"UPLOAD",artifactUrl:stored.url,artifactKind:kind,mimeType:file.type};}const response=await fetch("/api/claims",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error);setResult(data.claims?.[0]);}catch(caught){setError(caught instanceof Error?caught.message:"Could not check this material.");}finally{setBusy(false)}}
  if(result)return <div style={{marginTop:16}}><FactCard claim={result}/></div>;
  return <div>{open?<div style={{display:"grid",gap:10}}><label className="fact-label" htmlFor="manual-claim">Paste source text</label><textarea id="manual-claim" value={text} onChange={(event)=>{setText(event.target.value);if(event.target.value)setFile(undefined)}} placeholder="Paste the exact statement or caption…" rows={5} style={{width:"100%",resize:"vertical",border:"1px solid var(--line)",borderRadius:10,padding:12,background:"var(--paper)"}}/><span className="fact-label">or upload a screenshot, audio, or video</span><input aria-label="Source media upload" type="file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,video/mp4,video/webm,text/plain" onChange={(event)=>{const selected=event.target.files?.[0];setFile(selected);if(selected)setText("")}}/><button className="secondary-button" onClick={check} disabled={busy||(!file&&text.trim().length<10)}>{busy?"Processing…":file?"Upload and check media":"Check pasted statement"}</button>{error&&<p className="form-error" role="alert">{error}</p>}</div>:<button className="secondary-button" onClick={()=>setOpen(true)}>Paste text or upload media</button>}</div>;
}
