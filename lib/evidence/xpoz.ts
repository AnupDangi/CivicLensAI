import { ResponseType,type InstagramPost,type RedditPost,type TiktokPost,type TwitterPost } from "@xpoz/xpoz";
import type { EvidenceItem } from "@/lib/domain";
import { getXpozClient } from "@/lib/xpoz/client";

type SocialEvidence=Omit<EvidenceItem,"id"|"stance">;
function candidate(platform:string,url:string,title:string,publisher:string,snippet:string,publishedAt?:string):SocialEvidence{return {url,title,publisher,snippet:snippet.slice(0,600),sourceTier:6,sourceType:"SOCIAL_PUBLIC_DISCOURSE",matchedBecause:[`${platform} social search match`,`public discourse context`],publishedAt}}
function safeDate(value:string|number|null|undefined):string|undefined{if(value==null)return;const date=new Date(typeof value==="number"&&value<1e12?value*1000:value);return Number.isNaN(date.getTime())?undefined:date.toISOString()}
function twitter(item:TwitterPost):SocialEvidence|undefined{if(!item.id||!item.text)return;return candidate("X",`https://x.com/${item.authorUsername||"i"}/status/${item.id}`,`X post by ${item.authorUsername||"unknown user"}`,"X",item.text,safeDate(item.createdAt))}
function instagram(item:InstagramPost):SocialEvidence|undefined{if(!item.id||!item.caption)return;return candidate("Instagram",item.codeUrl||`https://www.instagram.com/p/${item.id}/`,`Instagram post by ${item.username||"unknown user"}`,"Instagram",item.caption,safeDate(item.createdAt))}
function reddit(item:RedditPost):SocialEvidence|undefined{if(!item.id||(!item.title&&!item.selftext))return;return candidate("Reddit",item.postUrl||item.permalink||`https://www.reddit.com/comments/${item.id}/`,item.title||"Reddit post",`Reddit · ${item.authorUsername||"unknown user"}`,[item.title,item.selftext].filter(Boolean).join(" — "),safeDate(item.createdAt))}
function tiktok(item:TiktokPost):SocialEvidence|undefined{if(!item.id||!item.description)return;return candidate("TikTok",`https://www.tiktok.com/@${item.username||"i"}/video/${item.id}`,`TikTok by ${item.username||"unknown creator"}`,"TikTok",item.description,safeDate(item.createdAt))}

export async function searchSocialEvidence(query:string):Promise<SocialEvidence[]>{
  if(!process.env.XPOZ_API_KEY)return [];
  const client=await getXpozClient();
  const settled=await Promise.allSettled([
    client.twitter.searchPosts(query,{responseType:ResponseType.Fast,limit:5,filterOutRetweets:true}),
    client.instagram.searchPosts(query,{responseType:ResponseType.Fast,limit:5}),
    client.reddit.searchPosts(query,{responseType:ResponseType.Fast,limit:5}),
    client.tiktok.searchPosts(query,{responseType:ResponseType.Fast,limit:5}),
  ]);
  const twitterPosts=settled[0].status==="fulfilled"?settled[0].value.data:[];
  const instagramPosts=settled[1].status==="fulfilled"?settled[1].value.data:[];
  const redditPosts=settled[2].status==="fulfilled"?settled[2].value.data:[];
  const tiktokPosts=settled[3].status==="fulfilled"?settled[3].value.data:[];
  return [
    ...twitterPosts.map(twitter),
    ...instagramPosts.map(instagram),
    ...redditPosts.map(reddit),
    ...tiktokPosts.map(tiktok),
  ].filter((item):item is SocialEvidence=>Boolean(item)).slice(0,16);
}
import "server-only";
