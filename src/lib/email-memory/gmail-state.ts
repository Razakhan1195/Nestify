import { EMAIL_CATEGORIES,categoryQuery,initialWindow,type EmailCategory } from "./policy";
export type GmailWork={phase:"search"|"read"|"complete";after:number;before:number;bucketEnd:number;page?:string;ids:string[];index:number;count:number;processed:number;proposed:number;ignored:number;failed:number;capReached:boolean;mode:"initial"|"new"|"older";checkpoint:number;oldest:number;discovered?:string[];queryVersion?:number;retryAt?:string;retryAttempt?:number;rateLimitRetries?:number};
export const GMAIL_QUERY_VERSION=3;
export function newWork(now=new Date(),movedIn?:string|null):GmailWork{
 const w=initialWindow(now,movedIn);
 return {phase:"search",...w,bucketEnd:w.before,ids:[],index:0,count:0,processed:0,proposed:0,ignored:0,failed:0,capReached:false,mode:"initial",checkpoint:0,oldest:w.after,discovered:[],queryVersion:GMAIL_QUERY_VERSION};
}
export function bucketStart(work:GmailWork){return Math.max(work.after,work.bucketEnd-30*86400);}
export function nextWindow(previous:GmailWork,mode:"new"|"older",now=new Date()):GmailWork{
 if(previous.phase!=="complete")throw Error("Finish the current import first");
 const base=newWork(now);base.mode=mode;base.checkpoint=previous.checkpoint||previous.before;base.oldest=previous.oldest;
 if(mode==="new"){base.after=Math.max(base.after,base.checkpoint-2*86400);}
 else{base.before=previous.oldest;base.after=base.before-90*86400;base.oldest=base.after;}
 base.bucketEnd=base.before;return base;
}
export function searchQuery(work:GmailWork,categories:EmailCategory[],excluded:string[]){
 const selected=categories.filter(c=>EMAIL_CATEGORIES.includes(c));
 if(!selected.length)throw Error("Choose a category");
 const senders=excluded.filter(v=>/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(v)).slice(0,50).map(v=>"-from:"+v).join(" ");
 return 'after:'+bucketStart(work)+' before:'+work.bucketEnd+' -in:spam -in:trash -category:promotions -category:social -subject:"verification code" -subject:"password reset" ('+selected.map(categoryQuery).join(" OR ")+') '+senders;
}
export function acceptSearchPage(work:GmailWork,ids:string[],next?:string){
 const remaining=500-work.count,unique=[...new Set(ids)].filter(id=>!(work.discovered??[]).includes(id)&&/^[a-zA-Z0-9_-]{1,128}$/.test(id)).slice(0,remaining);
 return {...work,phase:"read" as const,ids:unique,index:0,count:work.count+unique.length,discovered:[...(work.discovered??[]),...unique],page:next,capReached:work.count+unique.length>=500};
}
export function advancePage(work:GmailWork):GmailWork{
 if(work.index<work.ids.length)return work;
 if(work.capReached||(!work.page&&bucketStart(work)<=work.after))return {...work,phase:"complete",checkpoint:work.mode==="older"?work.checkpoint:work.before};
 return {...work,phase:"search",ids:[],index:0,...(!work.page?{bucketEnd:bucketStart(work)}:{})};
}

/** Revisit the same consented window once after a query fix. Preserve completed IDs,
 * counters, the 500 cap and saved findings; re-discover pending IDs under the new query. */
export function upgradeDiscovery(work:GmailWork):GmailWork {
 if((work.queryVersion??1)>=GMAIL_QUERY_VERSION || work.capReached || work.count>=500)return work;
 const pending=new Set(work.phase==="read"?work.ids.slice(work.index):[]);
 const discovered=(work.discovered??work.ids.slice(0,work.index)).filter(id=>!pending.has(id));
 return {...work,queryVersion:GMAIL_QUERY_VERSION,phase:"search",bucketEnd:work.before,page:undefined,ids:[],index:0,
   count:Math.max(work.processed,work.count-pending.size),discovered};
}
