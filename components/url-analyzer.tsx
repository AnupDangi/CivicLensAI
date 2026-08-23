"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function UrlAnalyzer() {
  const router=useRouter(); const [url,setUrl]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");try{const response=await fetch("/api/analyses",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not start analysis.");router.push(data.destination||data.resultUrl);}catch(caught){setError(caught instanceof Error?caught.message:"Could not start analysis.");setBusy(false);}}
  return <form className="analyzer" id="analyze" onSubmit={submit}><div className="analyzer-row"><label className="sr-only" htmlFor="source-url">Public source URL</label><input id="source-url" className="url-input" type="url" inputMode="url" placeholder="Paste a post, video, or article URL…" value={url} onChange={(event)=>setUrl(event.target.value)} required/><span className="auto-language" title="CivicLens detects language for each claim and transcript segment"><span aria-hidden="true">◎</span> Auto language</span><button className="primary-button" disabled={busy}>{busy?"Opening lens…":"Analyze source →"}</button></div>{error&&<p className="form-error" role="alert">{error}</p>}</form>;
}
