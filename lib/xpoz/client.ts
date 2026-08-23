import "server-only";
import { XpozClient } from "@xpoz/xpoz";

let clientPromise:Promise<XpozClient>|undefined;

export function getXpozClient():Promise<XpozClient>{
  if(!process.env.XPOZ_API_KEY)throw new Error("XPOZ_API_KEY is not configured.");
  if(!clientPromise)clientPromise=(async()=>{const client=new XpozClient({apiKey:process.env.XPOZ_API_KEY,versionCheck:false,timeoutMs:45_000});await client.connect();return client})().catch((error)=>{clientPromise=undefined;throw error});
  return clientPromise;
}
