/** Public status contains no mailbox content or internal identifiers. */
export function gmailProgress(link:{status:string;error_code?:string|null;lease_until?:string|null;updated_at:string;work:{phase:string;retryAt?:string}},now=Date.now()){
 if(link.status==="reconnect")return {state:"reconnect",label:"Reconnect Gmail to continue. Your saved records are kept."};
 if(link.status==="paused"&&link.error_code==="reader_capacity")return {state:"paused",label:"Email reading is temporarily at capacity. Review the records already found, or resume later. Your progress is kept."};
 if(link.status!=="active")return {state:"paused",label:"Search paused. Your records and progress are kept."};
 if(link.work.phase==="complete")return {state:"complete",label:"This search is complete. You can choose older records separately."};
 if(Date.parse(link.work.retryAt??"")>now)return {state:"waiting",label:"The reading service needs a short pause. Rezlee will retry shortly. Your search progress is saved."};
 if(Date.parse(link.lease_until??"")>now)return {state:"processing",label:link.work.phase==="search"?"Looking for matching home emails. You can leave this screen.":"Reading matching emails. Review records as they arrive; you can leave this screen."};
 return {state:"queued",label:"Waiting for the next processing step. Your search progress is saved."};
}
