import type { ContentArtifact,ExtractedSource,NormalizedSource } from "@/lib/domain";
import { getXpozClient } from "@/lib/xpoz/client";

function date(value:string|number|null|undefined):string|undefined{if(value==null)return;const adjusted=typeof value==="number"&&value<1e12?value*1000:value;const parsed=new Date(adjusted);return Number.isNaN(parsed.getTime())?undefined:parsed.toISOString()}
function mediaKind(url:string):"IMAGE"|"VIDEO"{return /\.(?:mp4|mov|webm)(?:\?|$)/i.test(url)||url.includes("video")?"VIDEO":"IMAGE"}
function artifact(kind:ContentArtifact["kind"],sourceUrl:string,language="und",text?:string,method="xpoz"):ContentArtifact{return {kind,sourceUrl,originalLanguage:language,originalText:text,extractionMethod:method,coverage:Boolean(text)?"COMPLETE":"PARTIAL",failureReason:!text?(kind==="TEXT"?"Xpoz returned no readable post text.":"Media queued for multimodal processing."):undefined}}

export async function extractSocialWithXpoz(source:NormalizedSource):Promise<ExtractedSource>{
  if(!source.externalId)throw new Error("The social post identifier is missing.");
  const client=await getXpozClient();
  if(source.kind==="X_POST"){
    const post=(await client.twitter.getPostsByIds([source.externalId],{forceLatest:true}))[0];
    if(!post||post.deleted)throw new Error("The X post is deleted, private, or unavailable through Xpoz.");
    const language=post.lang||"und";const artifacts=[artifact("TEXT",source.canonicalUrl,language,post.text||undefined)];
    for(const url of post.mediaUrls||[])artifacts.push(artifact(mediaKind(url),url,language));
    for(const url of post.urls||[])artifacts.push(artifact("LINKED_PAGE",url,language,undefined,"xpoz-linked-url"));
    return {source:{...source,author:post.authorUsername||source.author,publishedAt:date(post.createdAt)},title:`Post by ${post.authorUsername||source.author||"X user"}`,author:post.authorUsername||undefined,artifacts,limitations:[]};
  }
  if(source.kind==="INSTAGRAM_POST"){
    const indexed=await client.instagram.getPostsByIds([source.externalId],{forceLatest:true}).catch(()=>[]);
    const post=indexed[0]||await client.instagramLive.getPost(source.externalId);
    if(!post)throw new Error("The Instagram post is private, deleted, or unavailable through Xpoz.");
    const language="und";const artifacts=[artifact("TEXT",source.canonicalUrl,language,post.caption||post.subtitles||undefined)];
    if(post.imageUrl)artifacts.push(artifact("IMAGE",post.imageUrl,language));
    if(post.videoUrl)artifacts.push(artifact("VIDEO",post.videoUrl,language,post.subtitles||undefined));
    if(post.audioOnlyUrl)artifacts.push(artifact("AUDIO",post.audioOnlyUrl,language));
    return {source:{...source,author:post.username||undefined,publishedAt:date(post.createdAt)},title:`Instagram post by ${post.fullName||post.username||"unknown author"}`,author:post.username||undefined,artifacts,limitations:[]};
  }
  if(source.kind==="REDDIT_POST"){
    const result=await client.reddit.getPostWithComments(source.externalId,{forceLatest:true});const post=result.post;
    if(!post)throw new Error("The Reddit post is deleted, private, or unavailable through Xpoz.");
    const text=[post.title,post.selftext].filter(Boolean).join("\n\n");const artifacts=[artifact("TEXT",source.canonicalUrl,"und",text)];
    if(post.url&&post.url!==source.canonicalUrl)artifacts.push(artifact(mediaKind(post.url),post.url,"und",undefined,"xpoz-linked-media"));
    return {source:{...source,author:post.authorUsername||undefined,publishedAt:date(post.createdAt)},title:post.title||"Reddit post",author:post.authorUsername||undefined,artifacts,limitations:result.comments?.length?[`${result.comments.length} comments were available as social context but are not treated as truth evidence.`]:[]};
  }
  if(source.kind==="TIKTOK_POST"){
    const post=(await client.tiktok.getPostsByIds([source.externalId],{forceLatest:true}))[0];
    if(!post||post.isPrivate)throw new Error("The TikTok post is private, deleted, or unavailable through Xpoz.");
    const transcript=post.transcriptsJson?Object.values(post.transcriptsJson).join("\n"):undefined;const language=post.descriptionLanguage||"und";
    const artifacts=[artifact("TEXT",source.canonicalUrl,language,[post.description,transcript].filter(Boolean).join("\n\n"))];
    if(post.videoThumbnail)artifacts.push(artifact("IMAGE",post.videoThumbnail,language));
    if(post.videoUrl?.[0])artifacts.push(artifact("VIDEO",post.videoUrl[0],language,transcript));
    return {source:{...source,author:post.username||source.author,publishedAt:date(post.createdAt)},title:`TikTok by ${post.nickname||post.username||source.author||"creator"}`,author:post.username||undefined,artifacts,limitations:[]};
  }
  throw new Error("Xpoz does not support this source kind.");
}
