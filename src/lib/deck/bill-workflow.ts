import { BILL_AGENT, billAgentHistoryInput } from "./bill-agent";
import type { DeckV2TaskRun, DeckV2WorkflowRun } from "./v2-client";
import type { TelecomPhase } from "./telecom-import";

export function billWorkflowSteps(credentialId: string, sinceDate: string) {
  if (!/^cred_[a-zA-Z0-9_-]+$/.test(credentialId)) throw Error("Invalid workflow credential.");
  const { since_bill_date } = billAgentHistoryInput({ account_number: "template", since_date: sinceDate });
  return [
    { name: "log_in", credential_id: credentialId },
    { name: "extract_account", credential_id: credentialId },
    // Explicit template preserves per-account execution; never freeze one account
    // onto every loop item. Credentials override ALL steps, not just login.
    { name: "fetch_12_months", credential_id: credentialId, input: { account_number: "{{ item.account_number }}", since_bill_date } },
  ];
}
export function workflowPhaseTask(workflow: DeckV2WorkflowRun, phase: TelecomPhase): string | null {
  if (workflow.id !== phase.workflowRunId || workflow.workflow_id !== phase.workflowId || phase.workflowId !== BILL_AGENT.workflowId)
    throw Error("Workflow does not match this import.");
  const name = phase.kind === "authenticate" ? "log_in" : phase.kind === "accounts" ? "extract_account" : "fetch_12_months";
  const steps = workflow.steps.filter(s => s.name === name);
  if (steps.length !== 1) throw Error("Workflow step is missing or ambiguous.");
  const step = steps[0];
  const runs = (step.task_runs ?? []).filter(r => {
    if (phase.kind !== "history") return true;
    const item = r.item && typeof r.item === "object" ? r.item as Record<string, unknown> : {};
    return typeof item.account_number === "string" && item.account_number.replace(/\s/g, "") === String(phase.input.account_number).replace(/\s/g, "");
  });
  if (runs.length > 1) throw Error("Workflow account run is ambiguous.");
  if (runs.length === 1) return runs[0].task_run_id;
  if (["completed", "failed", "canceled"].includes(workflow.status) || step.status === "skipped")
    throw Error("Workflow ended without the requested task.");
  return null;
}
export function assertWorkflowTask(run: DeckV2TaskRun, phase: TelecomPhase, credentialId: string, sessionId: string | null) {
  if (run.task_id !== phase.taskId || run.credential_id !== credentialId || run.source_id !== phase.sourceId || !sessionId || run.session_id !== sessionId)
    throw Error("Workflow task identity does not match this connection.");
}
