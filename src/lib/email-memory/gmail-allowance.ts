import type {SupabaseClient} from "@supabase/supabase-js";
export type GmailAllowance={allowed:boolean;reason:"allowed"|"user_limited"|"service_limited"|"unavailable";dailyLimit?:number;monthlyLimit?:number;dailyUsed?:number;monthlyUsed?:number;retryAt?:string|null};
export async function gmailAllowance(admin:SupabaseClient,userId:string):Promise<GmailAllowance> {
 const {data,error}=await admin.rpc("rezlee_gmail_ai_capacity",{p_user:userId});
 if(error||!data||typeof data.allowed!=="boolean"||!["allowed","user_limited","service_limited","unavailable"].includes(data.reason))return {allowed:false,reason:"unavailable"};
 return {allowed:data.allowed,reason:data.reason,dailyLimit:data.dailyLimit,monthlyLimit:data.monthlyLimit,dailyUsed:data.dailyUsed,monthlyUsed:data.monthlyUsed,retryAt:typeof data.retryAt==="string"&&Number.isFinite(Date.parse(data.retryAt))?data.retryAt:null};
}
