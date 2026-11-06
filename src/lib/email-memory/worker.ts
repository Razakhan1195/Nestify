import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailProposal } from "./extraction";
import { verifiedProposal } from "./review";
type Dependencies = {
  reserve(): Promise<{ok:boolean}>;
  extract(text:string):Promise<EmailProposal>;
};
/** One request-owned background attempt. No raw email persisted, no automatic model retries. */
export async function processEmailCapture(supabase:SupabaseClient,id:string,lease:string,text:string,deps:Dependencies) {
  let proposal:EmailProposal|null=null, status="failed";
  try {
    if ((await deps.reserve()).ok) {
      proposal=verifiedProposal(await deps.extract(text),text);
      status=proposal ? "ready" : "ignored";
    }
  } catch { /* No raw provider error or email content in logs. */ }
  // A cancelled/expired/replaced lease cannot write late results.
  const result=await supabase.rpc("finish_rezlee_email_capture",{p_id:id,p_lease:lease,p_status:status,p_proposal:proposal});
  if(result.error) console.warn("[email-capture]",{code:"finish_unconfirmed"});
}
