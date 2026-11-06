export type ImportAllowance={allowed:boolean;reason:string;dailyLimit?:number;monthlyLimit?:number;dailyUsed?:number;monthlyUsed?:number;retryAt?:string|null};
export function gmailPauseMessage(code:string|null,allowance?:ImportAllowance|null,now=Date.now()) {
 if(code==="capacity"){
  if(allowance?.allowed)return "Email reading can continue now. Resume to pick up where you left off; your records are kept.";
  const time=allowance?.retryAt&&Date.parse(allowance.retryAt)>now?new Date(allowance.retryAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):null;
  const reason=allowance?.reason==="service_limited"?"Rezlee’s shared reading allowance is temporarily full.":"You’ve reached your email-reading allowance.";
  return reason+(time?" You can try resuming after "+time+".":" Check again later.")+" Review your ready records while you wait.";
 }
 if(code==="reader_capacity")return "Rezlee’s shared email-reading capacity is temporarily full. Your Gmail connection is working. Review your ready records now, or resume later; your progress is kept.";
 if(code==="budget_unavailable")return "Email reading is temporarily unavailable. Your records and place in the search are kept. Try resuming shortly.";
 if(code==="reader_unavailable")return "Rezlee’s email reader is temporarily unavailable. Your connection and progress are kept; you don’t need to reconnect.";
 if(code==="provider_limit")return "The reading service is busy. Wait a minute, then resume. Your records and progress are kept; you don’t need to reconnect.";
 if(code==="read_timeout")return "One email is taking too long to read, even after a retry. Your search progress is saved. Resume to try that email again.";
 if(code==="read_format")return "One email couldn’t be read reliably after a retry. Your search progress is saved. Resume to try it again; no need to reconnect Gmail.";
 if(code==="service_error")return "The reading service is temporarily unavailable after a retry. Your records and progress are kept. Try resuming shortly.";
 if(code==="authorization")return "Google access needs renewing. Your saved records are safe.";
 return "We couldn’t finish this search. Resume from saved progress when you’re ready.";
}
