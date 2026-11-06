export type ClaimSource = {id:string;title:string;updated_at:string;expires_on:string|null;hasFile:boolean};
export type ClaimFact = {sourceId:string;kind:"product"|"purchase"|"coverage"|"exclusion"|"deadline"|"contact";excerpt:string;page:number|null};
export type ClaimResult = {evidence:{facts:ClaimFact[];relationship:"consistent"|"unclear"|"conflicting"};sources:ClaimSource[];warnings:string[];draft:string};
export type ClaimReceipt = {request_id:string;state:"reading"|"ready"|"failed";created_at:string;input:{itemName:string;issue:string;documentIds:string[];sources:ClaimSource[]};result:ClaimResult|null};
export function manualWarrantyDraft(itemName:string,issue:string):string {
 return ["Subject: Warranty assistance request — "+itemName.trim(),"","Hello,","",
 "I would like help checking whether warranty coverage may apply to "+itemName.trim()+".","","What happened:",issue.trim(),"",
 "Please confirm whether this issue is covered and tell me which proof of purchase, product details, photos or other information you need. Please also confirm any claim deadline, exclusions and next steps before I arrange work or pay any charges.","","Thank you."].join("\n");
}
