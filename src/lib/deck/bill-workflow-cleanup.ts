import type { SupabaseClient } from "@supabase/supabase-js";
import { BILL_AGENT } from "./bill-agent";
import type { createDeckV2Client } from "./v2-client";
import type { TelecomPhase } from "./telecom-import";

export async function cancelOwnedBillWorkflows(db: SupabaseClient, deck: ReturnType<typeof createDeckV2Client>, userId: string, providerId: string) {
  const jobs = await db.from("deck_telecom_imports").select("id,phases,credential_id")
    .eq("user_id", userId).eq("provider_id", providerId).order("created_at", { ascending: false }).limit(101);
  if (jobs.error || (jobs.data?.length ?? 0) > 100) throw Error("Workflow cleanup needs review.");
  const seen = new Set<string>();
  for (const job of jobs.data ?? []) {
    const phase = (job.phases as TelecomPhase[])[0];
    if (!phase?.workflowRunId || seen.has(phase.workflowRunId)) continue;
    seen.add(phase.workflowRunId);
    const run = await deck.getWorkflowRun(phase.workflowRunId);
    if (run.id !== phase.workflowRunId || run.workflow_id !== BILL_AGENT.workflowId) throw Error("Workflow cleanup identity mismatch.");
    if (["completed", "failed", "canceled"].includes(run.status)) continue;
    if (!job.credential_id) throw Error("Workflow cleanup credential missing.");
    const credential = await deck.getCredential(job.credential_id);
    if (credential.id !== job.credential_id || credential.external_id !== `${userId}:${providerId}`) throw Error("Workflow cleanup ownership mismatch.");
    const canceled = await deck.cancelWorkflowRun(run.id, `rezlee-stop-workflow-${run.id}`);
    if (canceled.id !== run.id || !["completed", "failed", "canceled"].includes(canceled.status)) throw Error("Workflow cancellation is pending.");
  }
}
