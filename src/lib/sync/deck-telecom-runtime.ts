import { billWorkflowSteps, workflowPhaseTask, assertWorkflowTask } from "@/lib/deck/bill-workflow";
import { BILL_AGENT, billAgentAccounts, billAgentHistoryInput, billAgentHistoryOutput, billAgentExtraction } from "@/lib/deck/bill-agent";
import { publicHistoryCoverage } from "@/lib/deck/history-coverage";
import { historyMonths } from "@/lib/deck/history-range";
import { isCodeInteraction, telecomFailureMessage, ROGERS_REGISTRY_ID } from "@/lib/deck/telecom-auth";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAccountOperation, rememberDeckProvider } from "@/lib/account/operations";
import { createDeckV2Client } from "@/lib/deck/v2-client";
import type { DeckProviderConfig } from "@/lib/deck/provider-config";
import type { ProviderRow } from "@/lib/providers";
import { record, telecomImportPlan, telecomBillRows, telecomCoverage, telecomOutcome, telecomInteractionKey, type TelecomPhase, type TelecomSummary } from "@/lib/deck/telecom-import";
import { queueTelecomPush, deliverTelecomPushes } from "@/lib/deck/telecom-push";
import { prepareTelecomOriginals, saveTelecomOriginals } from "@/lib/deck/telecom-originals";
import { telecomOutputWithDocuments } from "@/lib/deck/telecom-document-output";

type Job = { id: string; user_id: string; home_id: string; provider_id: string; status: string; credential_id: string | null; session_id: string | null; phases: TelecomPhase[]; phase_index: number; task_run_id: string | null; sync_run_id: string | null; run_attempt: number; since_date: string; until_date: string; accounts: string[]; coverage: unknown[]; bill_ids: string[]; original_ids: string[]; all_complete: boolean; message: string; challenge_key: string | null; verification_expires_at: string | null; lease_token: string | null; failures: number; updated_at: string; created_at: string };
const active = ["preparing", "queued", "running", "verification"];
export function isTelecomConfig(config: DeckProviderConfig) { return !!config.telecomHistoryTaskId && process.env.REZLEE_DECK_TELECOM_ENABLED === "true"; }
async function checked(result: PromiseLike<{ error: unknown }>) { const r = await result; if (r.error) throw Error("Could not save connection progress."); }
export function scheduleTelecomRecovery(jobId?: string) {
  after(async () => { try { if (jobId) { await advanceTelecomImport(jobId); await advanceTelecomImport(jobId); } await deliverTelecomPushes(createAdminClient()); } catch { console.error("[deck:telecom] background continuation needs retry"); } });
}
export async function startTelecomImport(input: { provider: ProviderRow; config: DeckProviderConfig; username?: string; password?: string; sourceFields?: Record<string, string>; hostedCredentialId?: string; hostedAuthId?: string; historyMonths?: number }) {
  const { provider, config } = input; const db = createAdminClient();
  const hosted = input.hostedAuthId ? await db.from("deck_telecom_imports").select("id,credential_id,status").eq("hosted_auth_id", input.hostedAuthId).eq("user_id", provider.user_id).eq("provider_id", provider.id).maybeSingle() : null;
  if (hosted?.error) throw Error("Could not check your connection handoff.");
  if (hosted?.data?.credential_id) { scheduleTelecomRecovery(hosted.data.id); return { ok: true, providerId: provider.id, status: hosted.data.status, message: "Your connection is saved." }; }
  const existing = await db.from("deck_telecom_imports").select("id,status").eq("provider_id", provider.id).eq("user_id", provider.user_id).in("status", active).maybeSingle();
  if (existing.error) throw Error("Bill imports are not available yet.");
  if (existing.data && existing.data.id !== hosted?.data?.id) { if (input.hostedAuthId) throw Error("An import is already in progress."); scheduleTelecomRecovery(existing.data.id); return { ok: true, providerId: provider.id, status: "syncing", message: "Your bill import is already in progress." }; }
  const months = historyMonths(input.historyMonths ?? record(provider.deck_connection_metadata).historyMonths);
  const { windows, phases } = telecomImportPlan({ registryId: provider.registry_provider_id ?? null, taskId: config.taskId, historyTaskId: config.telecomHistoryTaskId!, authenticationTaskId: config.authenticationTaskId, accountExtractionTaskId: config.accountExtractionTaskId, historyMonths: months });
  if (config.workflowId) for (const phase of phases) { phase.workflowId = config.workflowId; phase.sourceId = config.sourceId; }
  const last = await db.from("deck_telecom_imports").select("*").eq("provider_id", provider.id).eq("user_id", provider.user_id).in("status", ["failed", "partial"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last.error) throw Error("Could not check earlier import progress.");
  const prior = last.data as Job | null;
  const priorMatchesScope = prior?.since_date === windows.at(-1)!.since_date && prior.until_date === windows[0].until_date && JSON.stringify(prior.phases.map(p=>p.kind)) === JSON.stringify(phases.map(p=>p.kind));
  const resume = !config.workflowId && !prior?.phases.some(p => p.workflowId) && !input.username && !input.hostedCredentialId && prior && priorMatchesScope && prior.phase_index < prior.phases.length ? prior : null;
  const inserted = hosted?.data ? { data: hosted.data, error: null } : await db.from("deck_telecom_imports").insert({ hosted_auth_id: input.hostedAuthId ?? null,    
user_id: provider.user_id, home_id: provider.home_id, provider_id: provider.id,
    phases: resume ? resume.phases.map(p => ({ ...p, taskId: p.kind === "authenticate" ? config.authenticationTaskId! : p.kind === "accounts" ? config.accountExtractionTaskId! : p.kind === "latest" ? config.taskId : config.telecomHistoryTaskId! })) : phases, phase_index: resume?.phase_index ?? 0, since_date: resume?.since_date ?? windows.at(-1)!.since_date, until_date: resume?.until_date ?? windows[0].until_date,
    accounts: resume?.accounts ?? [], coverage: resume?.coverage ?? [], bill_ids: resume?.bill_ids ?? [], original_ids: resume?.original_ids ?? [], all_complete: resume?.all_complete ?? true  
}).select("id").single();
  if (inserted.error?.code === "23505" && input.hostedAuthId) throw Error("Another import is in progress. Your connection handoff will retry.");
  if (inserted.error?.code === "23505") return { ok: true, providerId: provider.id, status: "syncing", message: "Your bill import is already in progress." };
  if (inserted.error || !inserted.data) throw Error("Could not start bill import.");
  const jobId = inserted.data.id as string; const deck = createDeckV2Client(); let credentialId = input.hostedCredentialId ?? provider.deck_credential_id;
  try {
    if (input.username && input.password) {
      await rememberDeckProvider(provider.user_id, provider.id);
      const c = await deck.createCredential({ sourceId: config.sourceId, externalId: `${provider.user_id}:${provider.id}`, username: input.username, password: input.password, sourceFields: input.sourceFields, persistenceEnabled: true, idempotencyKey: `rezlee-telecom-credential-${jobId}` }); credentialId = c.id;
    }
    if (!credentialId) throw Error("Reconnect to continue importing bills.");
    if (input.hostedAuthId) {
      const queued = await db.rpc("queue_rezlee_hosted_import", { p_intent: input.hostedAuthId, p_credential: credentialId, p_job: jobId, p_metadata: { ...record(provider.deck_connection_metadata), historyMonths: months, billCategory: config.category, telecomImportId: jobId, taskRunId: null, agentId: config.agentId, taskId: config.taskId, sourceId: config.sourceId, credentialId, interaction: null, authExperience: "deck_hosted" } });
      if (queued.error || queued.data !== true) throw Error("Your connection changed. Open this provider to check its status.");
    } else {
    await checked(db.from("providers").update({ deck_credential_id: credentialId, deck_session_id: null, deck_connection_status: "queued", connection_status: "syncing", health_status: "healthy", sync_status: "initial_sync_pending", sync_failure_reason: null, requires_user_action: false, user_action_message: null, deck_connection_metadata: { ...record(provider.deck_connection_metadata), historyMonths: months, billCategory: config.category, telecomImportId: jobId, taskRunId: null, agentId: config.agentId, taskId: config.taskId, sourceId: config.sourceId, credentialId, interaction: null } }).eq("id", provider.id).eq("user_id", provider.user_id));
    await checked(db.from("deck_telecom_imports").update({ credential_id: credentialId, status: "queued", message: resume ? "Continuing your saved import." : "Checking your sign-in. Stay here for any verification." }).eq("id", jobId));
    }
    scheduleTelecomRecovery(jobId);
    if (input.username && provider.deck_credential_id && credentialId !== provider.deck_credential_id) await deck.deleteCredential(provider.deck_credential_id, `rezlee-telecom-replace-${jobId}`).catch(() => undefined);
    return { ok: true, providerId: provider.id, status: "syncing", message: "Your connection has started. Stay here until sign-in and verification finish." };
  } catch (error) {
    await db.from("deck_telecom_imports").update({ status: "failed", message: "Could not start this import. Please try again.", finished_at: new Date().toISOString() }).eq("id", jobId);
    throw error;
  }
}
export async function telecomSummary(db: SupabaseClient, userId: string, providerId: string): Promise<TelecomSummary | null> {
  const r = await db.from("deck_telecom_imports").select("*").eq("user_id", userId).eq("provider_id", providerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw Error("Could not load bill import progress.");
  const j = r.data as Job | null; if (!j) return null;
  return { ...publicHistoryCoverage(j.coverage, j), authenticated: j.phases.slice(0,j.phase_index).some(p=>p.kind === "authenticate") || j.bill_ids.length > 0, status: j.status, phase: j.phases[j.phase_index]?.kind ?? "done", saved: j.bill_ids.length, originals: j.original_ids.length, completedWindows: j.phases.slice(0, j.phase_index).filter(p => p.kind === "history").length, totalWindows: j.phases.filter(p => p.kind === "history").length, sinceDate: j.since_date, untilDate: j.until_date, message: j.message, updatedAt: j.updated_at, verificationExpiresAt: j.verification_expires_at };
}
export async function advanceTelecomImport(id: string, dependencies?: { db: SupabaseClient; deck: Pick<ReturnType<typeof createDeckV2Client>, "runTask" | "getTaskRun" | "cancelTaskRun"> & Partial<Pick<ReturnType<typeof createDeckV2Client>, "runWorkflow" | "getWorkflowRun" | "cancelWorkflowRun">> }) {
  const db = dependencies?.db ?? createAdminClient(); const now = new Date().toISOString(); const lease = randomUUID();
  const result = await db.from("deck_telecom_imports").update({ lease_token: lease, lease_until: new Date(Date.now() + 120000).toISOString() }).eq("id", id).in("status", active).or(`lease_until.is.null,lease_until.lt.${now}`).select("*").maybeSingle();
  if (result.error) throw Error("Could not claim bill import.");
  if (!result.data) return; const job = result.data as Job;
  const update = async (patch: Record<string, unknown>) => {
    const r = await db.from("deck_telecom_imports").update({ ...patch, lease_until: new Date(Date.now() + 120000).toISOString() }).eq("id", id).eq("lease_token", lease).select("id").maybeSingle();
    if (r.error || !r.data) throw Error("Import changed."); Object.assign(job, patch);
  };
  try {    
await withAccountOperation(job.user_id, async () => {
      const p = await db.from("providers").select("*").eq("id", job.provider_id).eq("user_id", job.user_id).single();
      const provider = p.data as ProviderRow | null;
      if (p.error || !provider) throw Error("Provider unavailable");
      if (job.status === "preparing") {
        if (Date.now() - Date.parse(job.created_at) > 120000) await update({ status: "failed", message: "Sign-in could not finish. Please try again." });
        return;
      }
      const deck = dependencies?.deck ?? createDeckV2Client();
      const cancelImport = async (taskRunId: string | null, key: string) => {
        const workflowRunId = job.phases[0]?.workflowRunId;
        if (workflowRunId) {
          if (!deck.cancelWorkflowRun || !deck.getWorkflowRun) throw Error("Workflow cancellation unavailable.");
          await update({ phases: job.phases.map(p => ({ ...p, workflowCancellationPending: true })) });
          let canceled = await deck.getWorkflowRun(workflowRunId);
          if (canceled.id !== workflowRunId || canceled.workflow_id !== job.phases[0].workflowId) throw Error("Workflow cancellation identity mismatch.");
          if (!["completed", "failed", "canceled"].includes(canceled.status)) canceled = await deck.cancelWorkflowRun(workflowRunId, key);
          if (["completed", "failed", "canceled"].includes(canceled.status)) await update({ phases: job.phases.map(p => ({ ...p, workflowCancellationPending: false })) });
          return canceled;
        }
        return taskRunId ? deck.cancelTaskRun(taskRunId, key) : null;
      };
      if (provider.deck_credential_id !== job.credential_id || provider.connection_status === "disconnected") {
        await cancelImport(job.task_run_id, `cancel-${job.id}`);
        await update({ status: "canceled", message: "Import stopped. Your saved bills are still available." }); return;
      }
      const providerUpdate = async (patch: Record<string, unknown>) => { const r = await db.from("providers").update(patch).eq("id", provider.id).eq("user_id", job.user_id).eq("deck_credential_id", job.credential_id).select("id").maybeSingle(); if (r.error || !r.data) throw Error("Connection changed"); };
      const notify = (kind: "verification" | "complete" | "stopped", key: string, title: string, body: string, expiresAt?: string | null) => queueTelecomPush(db, { userId: job.user_id, providerId: provider.id, jobId: id, kind, key, title, body, expiresAt });
      const phase = job.phases[job.phase_index];
      if (!phase) return;
      let workflowTaskId: string | null = null;
      if (phase.workflowId) {
        if (!deck.runWorkflow || !deck.getWorkflowRun) throw Error("Workflow execution unavailable.");
        if (!phase.workflowRunId) {
          const workflow = await deck.runWorkflow({ workflowId: phase.workflowId, steps: billWorkflowSteps(job.credential_id!, job.since_date), idempotencyKey: `rezlee-workflow-${id}` });
          if (workflow.workflow_id !== phase.workflowId || !/^wrun_[a-zA-Z0-9_-]+$/.test(workflow.id)) throw Error("Unexpected workflow response.");
          // Persist once before polling or saving any child task receipt. A lost
          // response reuses the same idempotency key and cannot launch a duplicate.
          await update({ phases: job.phases.map(p => ({ ...p, workflowRunId: workflow.id })), session_id: workflow.session_id, status: "running", failures: 0 });
          await providerUpdate({ deck_session_id: workflow.session_id, deck_connection_metadata: { ...record(provider.deck_connection_metadata), workflowRunId: workflow.id, workflowId: phase.workflowId, telecomImportId: id } });
          return;
        }
        const workflow = await deck.getWorkflowRun(phase.workflowRunId);
        workflowTaskId = workflowPhaseTask(workflow, phase);
        if (workflow.session_id && workflow.session_id !== job.session_id) await update({ session_id: workflow.session_id });
        if (!workflowTaskId) { await update({ next_attempt_at: new Date(Date.now() + 20000).toISOString(), failures: 0 }); return; }
        if (job.task_run_id && job.task_run_id !== workflowTaskId) throw Error("Workflow task changed.");
      }
      if (!job.task_run_id) {
        const run = workflowTaskId ? await deck.getTaskRun(workflowTaskId, true) : await deck.runTask({ taskId: phase.taskId, credentialId: job.credential_id!, sessionId: job.session_id, taskInput: phase.taskId === BILL_AGENT.historyTaskId ? billAgentHistoryInput(phase.input) : phase.input, idempotencyKey: `rezlee-telecom-${id}-${job.phase_index}-${job.run_attempt}` });
        if (phase.workflowId) assertWorkflowTask(run, phase, job.credential_id!, job.session_id);
        // Reusing this idempotency key recovers a lost response without starting another paid run.
        await update({ task_run_id: run.id, session_id: run.session_id ?? job.session_id, status: "running", failures: 0, message: phase.kind === "authenticate" ? "Signing in. Stay here for any verification." : "Retrieving your requested bill history." });
        const found = await db.from("provider_sync_runs").select("id").eq("deck_task_run_id", run.id).eq("provider_id", provider.id).maybeSingle();
        if (found.error) throw Error("Could not record import run");
        let syncId = found.data?.id as string | undefined;
        if (!syncId) { const s = await db.from("provider_sync_runs").insert({ user_id: job.user_id, home_id: job.home_id, provider_id: provider.id, run_type: phase.kind !== "history" ? "initial" : "backfill", status: "running", deck_task_run_id: run.id, message: job.message, metadata: { telecomImportId: id, phaseIndex: job.phase_index, workflowRunId: phase.workflowRunId ?? null } }).select("id").single(); if (s.error) throw Error("Could not record import run"); syncId = s.data.id; }
        await update({ sync_run_id: syncId });
        await providerUpdate({ deck_session_id: run.session_id, connection_status: "syncing", sync_status: "syncing", requires_user_action: false, deck_connection_metadata: { ...record(provider.deck_connection_metadata), telecomImportId: id, taskRunId: run.id, interaction: null } });
      }
      const run = await deck.getTaskRun(job.task_run_id!, true);
      if (phase.workflowId) assertWorkflowTask(run, phase, job.credential_id!, job.session_id);
      if (!job.sync_run_id) { // Recover a crash between recording the Deck run and its local receipt.
        const found = await db.from("provider_sync_runs").select("id").eq("deck_task_run_id", run.id).eq("provider_id", provider.id).maybeSingle();
        if (found.error) throw Error("Could not recover import run");
        const s = found.data ? found : await db.from("provider_sync_runs").insert({ user_id: job.user_id, home_id: job.home_id, provider_id: provider.id, run_type: phase.kind !== "history" ? "initial" : "backfill", status: "running", deck_task_run_id: run.id, metadata: { telecomImportId: id, phaseIndex: job.phase_index, workflowRunId: phase.workflowRunId ?? null } }).select("id").single();
        if (s.error || !s.data) throw Error("Could not recover import run"); await update({ sync_run_id: s.data.id });
      }
      const syncUpdate = (patch: Record<string, unknown>) => checked(db.from("provider_sync_runs").update(patch).eq("id", job.sync_run_id!).eq("user_id", job.user_id));
      if (run.status === "interaction_required" && run.interaction) {
        const key = telecomInteractionKey(run.id, run.updated_at, run.interaction);
        const expiry = job.challenge_key === key && job.verification_expires_at ? job.verification_expires_at : new Date(Date.parse(run.updated_at ?? now) + 300000).toISOString();
        if (Date.parse(expiry) <= Date.now()) {
          await cancelImport(run.id, `expired-${id}-${job.phase_index}`);
          const message = "Verification expired. Tap Try again to continue; your saved bills are safe.";
          await syncUpdate({ status: "failed", interaction: null, message, finished_at: now });
          await providerUpdate({ connection_status: "sync_failed", sync_status: "sync_failed", sync_failure_reason: "interaction_timeout", requires_user_action: false, user_action_message: message });
          await update({ status: job.bill_ids.length ? "partial" : "failed", message, verification_expires_at: null, finished_at: now }); return;
        }
        const receipt = await db.from("provider_sync_runs").select("status,metadata,updated_at").eq("id", job.sync_run_id!).single();
        if (receipt.error) throw Error("Could not check verification");
        if (receipt.data.status === "running" && record(receipt.data.metadata).interactionKey === key) return;
        if (job.challenge_key !== key || job.status !== "verification") {
          const metadata = record(receipt.data.metadata);
          const count = Number.isInteger(metadata.telecomVerificationCount) ? Number(metadata.telecomVerificationCount) : 0;
          const nextCount = count + (job.challenge_key !== key && isCodeInteraction(run.interaction) ? 1 : 0);
          if (nextCount > 2) {
            // Persist a terminal state before cancellation; late webhooks cannot reopen it.
            const message = telecomFailureMessage("verification_loop", job.bill_ids.length);
            await syncUpdate({ status: "failed", interaction: null, message, finished_at: now, metadata: { ...metadata, telecomVerificationCount: nextCount, stopReason: "verification_loop" } });
            await providerUpdate({ connection_status: "sync_failed", sync_status: "sync_failed", sync_failure_reason: "verification_loop", requires_user_action: false, user_action_message: message, deck_connection_metadata: { ...record(provider.deck_connection_metadata), interaction: null } });
            await update({ status: job.bill_ids.length ? "partial" : "failed", message, verification_expires_at: null, finished_at: now });
            await cancelImport(run.id, `verification-loop-${id}-${job.phase_index}`);
            await notify("stopped", `${id}:stopped`, "Your bill import needs attention", message);
            return;
          }
          // Stable receipt keeps form answers intact between polls; a new challenge clears them.
          const clean = (v: string) => v.replace(/(?:previous|submitted) (?:answer|code)[^"'\n]*["'][^"']*["']/gi, "Previous response was not accepted");
          const safeInteraction = { ...run.interaction, message: clean(run.interaction.message ?? "Your provider needs verification to continue."), fields: run.interaction.fields?.map(f => ({ ...f, label: f.label ? clean(f.label) : f.name })) };
          await syncUpdate({ status: "requires_user_action", interaction: safeInteraction, message: "Verification needed", metadata: { ...metadata, telecomVerificationCount: nextCount, telecomImportId: id, phaseIndex: job.phase_index, interactionKey: key, verificationExpiresAt: expiry } });
          await update({ status: "verification", challenge_key: key, verification_expires_at: expiry, message: "Verify with your provider to continue." });
          await providerUpdate({ connection_status: "needs_attention", sync_status: "security_question_required", deck_connection_status: "interaction_required", requires_user_action: true, user_action_message: "Your provider needs verification.", deck_connection_metadata: { ...record(provider.deck_connection_metadata), taskRunId: run.id, telecomImportId: id, interaction: safeInteraction } });
        }
        if (!provider.requires_user_action) await providerUpdate({ connection_status: "needs_attention", sync_status: "security_question_required", requires_user_action: true, user_action_message: "Your provider needs verification." });
        await notify("verification", `${id}:verify:${key}`, `${provider.display_name ?? provider.name} needs verification`, "Tap to verify so Rezlee can continue your bill import. This request expires shortly.", expiry);
        await update({ next_attempt_at: new Date(Date.now() + 20000).toISOString(), failures: 0 }); return;
      }
      if (["queued", "running", "pending"].includes(run.status)) {
        // Deck does not expose an authenticated milestone. This bounds the initial
        // wait for either a result or an interaction; it is not a login detector.
        const firstResultAt = Date.parse(run.created_at ?? job.created_at);
        const output = record(run.output);
        const hasRetrievedData = !!run.storage?.length || (Array.isArray(output.bills) && output.bills.length > 0);
        if (provider.registry_provider_id === ROGERS_REGISTRY_ID && phase.kind === "latest" &&
            !job.challenge_key && !job.bill_ids.length && !hasRetrievedData &&
            Number.isFinite(firstResultAt) && Date.now() - firstResultAt >= 120000) {
          const receipt = await db.from("provider_sync_runs").select("metadata").eq("id", job.sync_run_id!).eq("user_id", job.user_id).single();
          if (receipt.error) throw Error("Could not check connection progress");
          const metadata = { ...record(receipt.data?.metadata), stopReason: "initial_result_timeout", telecomCancellationPending: true };
          const message = telecomFailureMessage("initial_result_timeout", job.bill_ids.length);
          await syncUpdate({ status: "failed", interaction: null, message, finished_at: now, metadata });
          await providerUpdate({ connection_status: "sync_failed", sync_status: "sync_failed", sync_failure_reason: "initial_result_timeout", requires_user_action: false, user_action_message: message, deck_connection_metadata: { ...record(provider.deck_connection_metadata), interaction: null } });
          await update({ status: "failed", message, verification_expires_at: null, finished_at: now });
          // Persist the stop first. A late event cannot revive the import. Failed
          // cancellation is retried by recovery without starting a new login.
          try {
            const canceled = await deck.cancelTaskRun(run.id, `first-result-timeout-${run.id}`);
            if (["canceled", "failed", "completed"].includes(canceled.status))
              await syncUpdate({ metadata: { ...metadata, telecomCancellationPending: false } });
          } catch { /* Durable cancellation receipt is handled by recovery. */ }
          await notify("stopped", `${id}:stopped`, "Your Rogers connection stopped", message);
          return;
        }
        if (job.status === "verification") await syncUpdate({ status: "running", interaction: null, message: "Continuing your bill import." });
        await update({ status: "running", message: phase.kind === "authenticate" ? "Signing in. Stay here for any verification." : "Retrieving your requested bill history.", verification_expires_at: null, failures: 0, next_attempt_at: new Date(Date.now() + 20000).toISOString() });
        await providerUpdate({ connection_status: "syncing", sync_status: "syncing", requires_user_action: false, user_action_message: null }); return;
      }
      if (run.status === "completed" && run.result === "success" && phase.kind === "authenticate") {
        if ((phase.taskId === BILL_AGENT.loginTaskId ? record(run.output).login_status !== true : record(run.output).authenticated !== true) || !run.session_id) {
          if (phase.workflowRunId) await cancelImport(run.id, `unconfirmed-login-${id}`);
          const message = "We couldn’t confirm sign-in. Please reconnect; no bill history has been claimed.";
          await syncUpdate({status:"failed",finished_at:now,interaction:null,message});
          await providerUpdate({connection_status:"sync_failed",sync_status:"sync_failed",requires_user_action:false,user_action_message:message,sync_failure_reason:"authentication_unconfirmed"});
          await update({status:"failed",message,finished_at:now});
          await notify("stopped", `${id}:stopped`, "Your connection needs attention", message); return;
        }
        await syncUpdate({status:"success",finished_at:now,interaction:null,message:"Sign-in confirmed."});
        await providerUpdate({connection_status:"syncing",sync_status:"syncing",requires_user_action:false,user_action_message:null});
        await update({phase_index:job.phase_index+1,task_run_id:null,sync_run_id:null,session_id:run.session_id,challenge_key:null,verification_expires_at:null,status:"queued",message:"You’re signed in. You can close the app while we save your bills.",next_attempt_at:now,failures:0});
        return;
      }
      if (run.status === "completed" && run.result === "success" && phase.kind === "accounts") {
        const accounts = billAgentAccounts(run.output, provider.account_number);
        if (!run.session_id && !job.session_id) throw Error("Account extraction lost its authenticated session.");
        const template = job.phases[job.phase_index + 1];
        if (!template || template.kind !== "history") throw Error("History phase is missing.");
        const expanded = accounts.map(account => ({...template,input:{...template.input,account_number:account}}));
        await syncUpdate({status:"success",finished_at:now,interaction:null,message:"Provider accounts confirmed."});
        await update({accounts,phases:[...job.phases.slice(0,job.phase_index+1),...expanded],phase_index:job.phase_index+1,task_run_id:null,sync_run_id:null,session_id:run.session_id ?? job.session_id,status:"queued",message:"Your accounts are connected. Retrieving available bill history.",next_attempt_at:now,failures:0});
        return;
      }
      if (run.status === "completed" && run.result === "success" && phase.kind !== "authenticate" && phase.kind !== "accounts") {
        const agentHistory = phase.taskId === BILL_AGENT.historyTaskId;
        const requestedAccount = String(phase.input.account_number ?? "");
        const rawOutput = agentHistory ? billAgentHistoryOutput(run.output, requestedAccount) : run.output;
        const storage = agentHistory ? (run.storage ?? []).map(file => ({...file,extraction:billAgentExtraction(file.extraction,requestedAccount)})) : (run.storage ?? []);
        const prepared = await prepareTelecomOriginals(storage);
        const output = telecomOutputWithDocuments(rawOutput, prepared);
        const rows = telecomBillRows({ output, providerName: provider.display_name ?? provider.name, category: typeof record(provider.deck_connection_metadata).billCategory === "string" ? String(record(provider.deck_connection_metadata).billCategory) : "Other service", taskRunId: run.id, providerId: provider.id, userId: job.user_id, homeId: job.home_id, today: now.slice(0, 10), phase: phase.kind }).filter(row => phase.kind !== "history" || (String(row.issue_date) >= String(phase.input.since_date) && String(row.issue_date) <= String(phase.input.until_date)));
        const billIds = new Set(job.bill_ids); const saved: Array<{ id: string; row: Record<string, unknown> }> = [];
        for (const row of rows) { const r = await db.rpc("save_rezlee_telecom_bill", { p_job: id, p_lease: lease, p_run: run.id, p_bill: row }); if (r.error || !r.data) throw Error("Could not save a retrieved bill"); billIds.add(r.data as string); saved.push({ id: r.data as string, row }); await update({ bill_ids: [...billIds] }); }
        const originals = await saveTelecomOriginals({ db, jobId: id, lease, runId: run.id, userId: job.user_id, homeId: job.home_id, providerName: provider.display_name ?? provider.name, output, storage: run.storage ?? [], saved, prepared });
        const root = record(output); const rawBills = Array.isArray(root.bills) ? root.bills : [];
        const check = phase.kind === "history" ? telecomCoverage(output, phase.input as { since_date: string; until_date: string }, job.accounts) : { complete: rows.length > 0, accounts: Array.isArray(root.accounts) ? root.accounts.map(x => record(x).account_id).filter((x): x is string => typeof x === "string") : [], coverage: [] };
        const allCoverage = [...job.coverage, ...check.coverage];
        const allRanges = job.phases.filter(p => p.kind === "history");
        const rangeCoverage = check.accounts.every(account => allRanges.every(p => allCoverage.some(c => record(c).account_id === account && record(c).since_date === p.input.since_date && record(c).until_date === p.input.until_date && record(c).status === "complete")));
        const allComplete = job.all_complete && check.complete && rawBills.length === rows.length && (originals.complete || (rows.length === 0 && check.complete));
        const index = job.phase_index + 1; const finished = index >= job.phases.length;
        const outcome = telecomOutcome(billIds.size, allComplete && rangeCoverage);
        await syncUpdate({ status: "success", finished_at: now, interaction: null, message: `${rows.length} statements checked.`, metadata: { telecomImportId: id, phaseIndex: job.phase_index, billCount: rows.length } });
        if (finished && phase.workflowRunId && provider.account_number) await cancelImport(run.id, `selected-account-finished-${id}`);
        if (finished) await notify("complete", `${id}:complete`, outcome.status === "completed" && billIds.size > 0 ? "Your bills are ready" : "Your bill import finished", outcome.message);
        await providerUpdate({ connection_status: finished ? "connected" : "syncing", health_status: billIds.size ? "healthy" : "needs_attention", sync_status: finished ? "sync_complete" : "syncing", sync_failure_reason: null, requires_user_action: false, user_action_message: null, last_successful_sync_at: billIds.size ? now : provider.last_successful_sync_at, next_scheduled_sync_at: null, deck_connection_metadata: { ...record(provider.deck_connection_metadata), telecomImportId: id, taskRunId: run.id, interaction: null } });
        await update({ bill_ids: [...billIds], original_ids: [...new Set([...job.original_ids, ...originals.ids])], accounts: [...new Set([...job.accounts, ...check.accounts])], coverage: [...job.coverage, ...check.coverage], all_complete: allComplete, phase_index: index, task_run_id: null, sync_run_id: null, session_id: run.session_id ?? job.session_id, challenge_key: null, verification_expires_at: null, status: finished ? outcome.status : "queued", message: finished ? outcome.message : "Your latest bills are ready. Adding the rest of your history.", next_attempt_at: now, finished_at: finished ? now : null, failures: 0 });
        return;
      }
      if (["failed", "canceled", "review_required"].includes(run.status) || (run.status === "completed" && run.result !== "success")) {
        const rawCode = run.errors?.[0]?.code ?? "provider_unavailable";
        const code = ["auth_invalid", "credential_invalid", "credentials_invalid"].includes(rawCode) ? "credential_invalid" : rawCode;
        if (phase.workflowId && phase.kind === "history" && job.phase_index + 1 < job.phases.length) {
          await syncUpdate({ status: "failed", finished_at: now, interaction: null, message: "This account's history could not finish. Checking the remaining accounts." });
          await update({ all_complete: false, phase_index: job.phase_index + 1, task_run_id: null, sync_run_id: null, status: "queued", next_attempt_at: now, failures: 0 });
          return;
        }
        if (phase.workflowRunId) await cancelImport(run.id, `failed-workflow-${id}`);
        const message = telecomFailureMessage(code, job.bill_ids.length);
        await syncUpdate({ status: "failed", finished_at: now, interaction: null, message });
        await notify("stopped", `${id}:stopped`, "Your bill import needs attention", message);
        await providerUpdate({ connection_status: "sync_failed", sync_status: "sync_failed", sync_failure_reason: code, requires_user_action: false, user_action_message: message });
        await update({ status: job.bill_ids.length ? "partial" : "failed", message, finished_at: now, verification_expires_at: null });
        return;
      }
    });  
} catch {
    if (job.failures >= 4) {
      if (job.phases[0]?.workflowRunId) await update({ phases: job.phases.map(p => ({ ...p, workflowCancellationPending: true })) });
      await db.from("providers").update({ connection_status: "sync_failed", sync_status: "sync_failed", requires_user_action: false, user_action_message: "Your bill import paused. Try again to continue.", sync_failure_reason: "import_processing_failed" }).eq("id", job.provider_id).eq("deck_credential_id", job.credential_id);
      await queueTelecomPush(db, { userId: job.user_id, providerId: job.provider_id, jobId: id, key: `${id}:stopped`, kind: "stopped", title: "Your bill import needs attention", body: "Your saved bills are safe. Tap to continue the import." });
    }
    await update({ failures: job.failures + 1, status: job.failures >= 4 ? (job.bill_ids.length ? "partial" : "failed") : job.status, message: job.failures >= 4 ? "The import paused. Your saved bills are safe. Try again to continue." : job.message, next_attempt_at: new Date(Date.now() + Math.min(300000, 15000 * 2 ** job.failures)).toISOString() });
  } finally { await db.from("deck_telecom_imports").update({ lease_token: null, lease_until: null }).eq("id", id).eq("lease_token", lease); }
}
export async function processTelecomEvent(taskRunId: string): Promise<boolean> {
  const db = createAdminClient(); const r = await db.from("provider_sync_runs").select("metadata").eq("deck_task_run_id", taskRunId).limit(1).maybeSingle();
  if (r.error) throw Error("Could not find import run");
  const id = record(r.data?.metadata).telecomImportId;
  if (typeof id !== "string") return false;
  await advanceTelecomImport(id); await advanceTelecomImport(id); await deliverTelecomPushes(db); return true;
}
export async function retryTelecomCancellations(dependencies?: { db: SupabaseClient; deck: Pick<ReturnType<typeof createDeckV2Client>, "getTaskRun" | "cancelTaskRun"> }) {
  const db = dependencies?.db ?? createAdminClient();
  const deck = dependencies?.deck ?? createDeckV2Client();
  const pending = await db.from("provider_sync_runs").select("id,user_id,deck_task_run_id,metadata").eq("status", "failed").contains("metadata", { telecomCancellationPending: true }).limit(12);
  if (pending.error) throw Error("Could not read stopped connection requests");
  for (const receipt of pending.data ?? []) {
    if (!receipt.deck_task_run_id) continue;
    try {
      let run = await deck.getTaskRun(receipt.deck_task_run_id, false);
      if (!["canceled", "failed", "completed", "canceling"].includes(run.status))
        run = await deck.cancelTaskRun(receipt.deck_task_run_id, `first-result-timeout-${receipt.deck_task_run_id}`);
      if (["canceled", "failed", "completed"].includes(run.status))
        await checked(db.from("provider_sync_runs").update({ metadata: { ...record(receipt.metadata), telecomCancellationPending: false } }).eq("id", receipt.id).eq("user_id", receipt.user_id).eq("status", "failed"));
    } catch { /* Retry the same cancellation on the next recovery tick. */ }
  }
}
export async function recoverTelecomImports() {
  const cleanupDb = createAdminClient(), cleanupDeck = createDeckV2Client();
  const cleanup = await cleanupDb.from("deck_telecom_imports").select("id,phases").contains("phases", [{ workflowCancellationPending: true }]).limit(12);
  if (cleanup.error) throw Error("Could not read workflow cleanup requests.");
  for (const job of cleanup.data ?? []) {
    const phases = job.phases as TelecomPhase[];
    const workflowRunId = phases[0]?.workflowRunId;
    if (!workflowRunId) continue;
    try {
      let run = await cleanupDeck.getWorkflowRun(workflowRunId);
      if (run.id !== workflowRunId || run.workflow_id !== phases[0].workflowId) throw Error("Workflow cleanup mismatch.");
      if (!["completed", "failed", "canceled"].includes(run.status)) run = await cleanupDeck.cancelWorkflowRun(workflowRunId, `rezlee-stop-workflow-${workflowRunId}`);
      if (["completed", "failed", "canceled"].includes(run.status)) await checked(cleanupDb.from("deck_telecom_imports").update({ phases: phases.map(p => ({ ...p, workflowCancellationPending: false })) }).eq("id", job.id));
    } catch { /* Durable marker remains until a later recovery tick succeeds. */ }
  }
  await retryTelecomCancellations();
  const db = createAdminClient(); const q = await db.from("deck_telecom_imports").select("id").in("status", active).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(12);
  if (q.error) throw Error("Could not read pending bill imports");
  for (const j of q.data ?? []) { await advanceTelecomImport(j.id); await advanceTelecomImport(j.id); }
  await deliverTelecomPushes(db); return { checked: q.data?.length ?? 0 };
}
