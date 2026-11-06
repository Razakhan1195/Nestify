export type ProviderEvidence="configured"|"sandbox_verified"|"live_verified";
export type RetrievalEvidence={signedIn:boolean;listed:number|null;saved:number;validOriginals:number;coverage:"complete"|"partial"|"unavailable";accountsChecked:boolean;rangeChecked:boolean};
export function retrievalVerdict(e:RetrievalEvidence):"not_connected"|"needs_review"|"no_bills"|"complete"{
 if(!e.signedIn)return "not_connected";
 if(!Number.isSafeInteger(e.saved)||e.saved<0||e.validOriginals!==e.saved||!e.accountsChecked||!e.rangeChecked||e.coverage!=="complete"||e.listed===null||!Number.isSafeInteger(e.listed)||e.listed<0||e.saved!==e.listed)return "needs_review";
 return e.saved===0?"no_bills":"complete";
}
export function providerStage(row:Record<string,unknown>){
 const status=String(row.status??"unknown");
 if(["verification","requires_user_action"].includes(status))return "verification";
 if(["preparing","queued"].includes(status))return "waiting";
 if(["running","processing","syncing"].includes(status))return "retrieving";
 if(["completed","complete","success","succeeded"].includes(status))return "check_saved_bills";
 return ["failed","blocked","expired"].includes(status)?"needs_attention":"unknown";
}
