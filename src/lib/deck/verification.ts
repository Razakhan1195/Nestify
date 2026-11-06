import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VerificationRun = {
  id: string;
  status: string;
  updated_at: string;
  interaction: unknown;
};

export class DeckVerificationChangedError extends Error {
  constructor() {
    super("This verification step changed or was already submitted. Check the latest provider status before trying again.");
  }
}

// Answers are never part of the challenge identity or persisted claim.
export function deckChallengeId(run: VerificationRun | null): string | null {
  if (!run || run.status !== "requires_user_action" || !run.interaction ||
      typeof run.interaction !== "object" || !Number.isFinite(Date.parse(run.updated_at))) return null;
  return createHash("sha256")
    .update(JSON.stringify([run.id, run.updated_at, run.interaction]))
    .digest("hex");
}

export async function claimDeckVerification(input: {
  supabase: SupabaseClient;
  userId: string;
  run: VerificationRun;
  challengeId?: string;
  metadata: Record<string, unknown>;
}) {
  const current = deckChallengeId(input.run);
  if (!current || (input.challengeId !== undefined && input.challengeId !== current)) {
    throw new DeckVerificationChangedError();
  }
  // Older clients omit challengeId; they still receive single-winner protection.
  const result = await input.supabase.from("provider_sync_runs").update({
    status: "running",
    interaction: null,
    message: "Verification submitted. Continuing provider sign-in.",
    metadata: input.metadata,
  }).eq("id", input.run.id).eq("user_id", input.userId)
    .eq("status", "requires_user_action").eq("updated_at", input.run.updated_at)
    .select("id,updated_at").maybeSingle();
  if (result.error) throw new Error("Could not submit verification. Check the latest status and try again.");
  if (!result.data) throw new DeckVerificationChangedError();
  return { challengeId: current, version: result.data.updated_at as string };
}

// A late HTTP response must not overwrite a newer webhook or challenge.
export async function updateClaimedVerification(input: {
  supabase: SupabaseClient;
  userId: string;
  runId: string;
  version: string;
  patch: Record<string, unknown>;
}) {
  const result = await input.supabase.from("provider_sync_runs").update(input.patch)
    .eq("id", input.runId).eq("user_id", input.userId)
    .eq("status", "running").eq("updated_at", input.version)
    .select("id").maybeSingle();
  if (result.error) throw new Error("Could not update verification status. Refresh this connection to check its progress.");
  return Boolean(result.data);
}
