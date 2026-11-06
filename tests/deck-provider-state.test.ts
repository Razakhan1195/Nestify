import assert from "node:assert/strict";
import test from "node:test";

import {
  deckCredentialOperationKey,
  deckRunStatus,
  failureState,
  interactionIndicatesRejection,
  interactionIsUsable,
  isEchoedDeckInteraction,
  isStaleDeckEvent,
  preserveProviderStateDuringProgress,
  sanitizeDeckEventPayloadForStorage,
  shouldStartFreshDeckSession,
} from "../src/lib/sync/deck-v2-runtime";

test("Deck run statuses map to Rezlee lifecycle states", () => {
  assert.equal(deckRunStatus("queued"), "queued");
  assert.equal(deckRunStatus("running"), "running");
  assert.equal(deckRunStatus("pending"), "running");
  assert.equal(deckRunStatus("interaction_required"), "requires_user_action");
  assert.equal(deckRunStatus("completed"), "success");
  assert.equal(deckRunStatus("failed"), "failed");
  assert.equal(deckRunStatus("canceled"), "failed");
});

test("provider reconnect creates a fresh Deck credential operation key", () => {
  const base = {
    userId: "user_1",
    providerId: "provider_1",
    sourceId: "src_1",
  };

  const first = deckCredentialOperationKey({ ...base, nonce: "attempt-1" });
  const second = deckCredentialOperationKey({ ...base, nonce: "attempt-2" });

  assert.notEqual(first, second);
  assert.match(first, /^rezlee-cred-/);
  assert.match(second, /^rezlee-cred-/);
});
test("an immediate echo of the submitted verification prompt is not a new prompt", () => {
  const prompt = {
    type: "security_question",
    message: "Where did you meet your spouse?",
    fields: [{ name: "answer", label: "Where did you meet your spouse?", type: "string" }],
  };

  assert.equal(isEchoedDeckInteraction(prompt, prompt), true);
  assert.equal(
    isEchoedDeckInteraction(
      {
        ...prompt,
        message: "What was your first school?",
        fields: [{ name: "answer", label: "What was your first school?", type: "string" }],
      },
      prompt,
    ),
    false,
  );
});

test("security-question reducer rejects malformed prompts and detects rejected answers", () => {
  const actualQuestion = {
    type: "security_question",
    message: "Answer the security question to continue.",
    fields: [{ name: "answer", label: "Your favourite movie?", type: "string" }],
  };
  const malformed = {
    type: "security_question",
    message: "Please answer the following secret question to continue.",
    fields: [{
      name: "answer",
      label: "Please answer the following secret question to continue.",
      type: "string",
    }],
  };
  const rejected = {
    ...actualQuestion,
    message: "The previous answer was incorrect. Please try again.",
  };

  assert.equal(interactionIsUsable(actualQuestion), true);
  assert.equal(interactionIsUsable(malformed), false);
  assert.equal(interactionIndicatesRejection(rejected), true);
});

test("Deck event persistence redacts rejected verification answers", () => {
  const sanitized = sanitizeDeckEventPayloadForStorage({
    type: "task_run.interaction_required",
    data: {
      interaction: {
        message: "The previous answer \"sample-secret\" was incorrect.",
        fields: [{
          name: "answer",
          label: "The answer was previously 'sample-secret' but that was incorrect.",
        }],
      },
    },
  });

  const stored = JSON.stringify(sanitized);
  assert.equal(stored.includes("sample-secret"), false);
  assert.equal(stored.includes("previous answer"), true);
});

test("authentication failures start fresh sessions but retriable task failures can reuse one", () => {
  assert.equal(
    shouldStartFreshDeckSession({
      syncFailureReason: "auth_invalid",
      connectionStatus: "sync_failed",
      deckConnectionStatus: "failed",
      sessionId: "sess_auth",
    }),
    true,
  );
  assert.equal(
    shouldStartFreshDeckSession({
      syncFailureReason: "task_failed",
      connectionStatus: "sync_failed",
      deckConnectionStatus: "failed",
      sessionId: "sess_reusable",
    }),
    false,
  );
  assert.equal(
    shouldStartFreshDeckSession({
      syncFailureReason: "task_failed",
      connectionStatus: "sync_failed",
      deckConnectionStatus: "failed",
      sessionId: null,
    }),
    true,
  );
  assert.equal(
    shouldStartFreshDeckSession({
      syncFailureReason: null,
      connectionStatus: "connected",
      deckConnectionStatus: "connected",
      sessionId: "sess_healthy",
    }),
    false,
  );
});

test("progress events never downgrade verification or terminal states", () => {
  assert.equal(preserveProviderStateDuringProgress("running", false), false);
  assert.equal(preserveProviderStateDuringProgress("queued", false), false);
  assert.equal(
    preserveProviderStateDuringProgress("requires_user_action", false),
    true,
  );
  assert.equal(preserveProviderStateDuringProgress("success", false), true);
  assert.equal(preserveProviderStateDuringProgress("failed", false), true);
  assert.equal(preserveProviderStateDuringProgress("running", true), true);
});

test("stale Deck events are ignored only after an event was handled", () => {
  const older = "2026-09-18T13:00:00.000Z";
  const newer = "2026-09-18T13:01:00.000Z";
  assert.equal(
    isStaleDeckEvent({
      hasPriorDeckEvent: true,
      incomingEventAt: older,
      lastHandledAt: newer,
    }),
    true,
  );
  assert.equal(
    isStaleDeckEvent({
      hasPriorDeckEvent: true,
      incomingEventAt: newer,
      lastHandledAt: older,
    }),
    false,
  );
  assert.equal(
    isStaleDeckEvent({
      hasPriorDeckEvent: false,
      incomingEventAt: older,
      lastHandledAt: newer,
    }),
    false,
  );
});

test("Deck auth and verification timeouts have different recovery states", () => {
  const auth = failureState({
    id: "trun_auth",
    status: "failed",
    errors: [{ code: "auth_invalid" }],
  });
  assert.equal(auth.connection_status, "sync_failed");
  assert.equal(auth.requires_user_action, false);
  assert.equal(auth.sync_status, "sync_failed");
  assert.match(
    auth.user_action_message ?? "",
    /blocked automated sign-in/i,
  );
  const timeout = failureState({
    id: "trun_timeout",
    status: "failed",
    errors: [{ code: "interaction_timeout" }],
  });
  assert.equal(timeout.connection_status, "needs_attention");
  assert.equal(timeout.requires_user_action, true);
  assert.equal(timeout.sync_status, "authentication_required");

  const executionTimeout = failureState({
    id: "trun_execution_timeout",
    status: "failed",
    errors: [{ code: "timeout" }],
  });
  assert.equal(executionTimeout.connection_status, "sync_failed");
  assert.equal(executionTimeout.requires_user_action, false);
  assert.match(
    executionTimeout.user_action_message ?? "",
    /longer than expected/i,
  );

  const generic = failureState({
    id: "trun_generic",
    status: "failed",
    errors: [{ code: "provider_unavailable" }],
  });
  assert.equal(generic.connection_status, "sync_failed");
  assert.equal(generic.requires_user_action, false);
  assert.equal(generic.sync_status, "sync_failed");
});
