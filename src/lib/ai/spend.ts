import { privateAiMiddleware } from "./privacy-policy";
import { verifiedZeroCostRejection } from "./failure-receipt";
import { randomUUID } from "node:crypto";
import { gateway } from "@ai-sdk/gateway";
import { wrapLanguageModel, type LanguageModel } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeUsage, spendMiddleware, type SpendFeature } from "./spend-policy";
/** Separate identity for every actual attempt, including retries, streams and explicit fallbacks. */
export function budgetedModel(model: LanguageModel, feature: SpendFeature, observe?: (event: {stage: "reserve" | "settle"; elapsedMs: number; success: boolean}) => void) {
  const resolved = typeof model === "string" ? gateway(model) : model;
  if (resolved.specificationVersion !== "v3") throw new Error("This AI operation is not available.");
  return wrapLanguageModel({ model: resolved, middleware: [privateAiMiddleware(), spendMiddleware(async () => {
    const id = randomUUID(), db = createAdminClient(), started = Date.now();
    try {
      const r = await db.rpc("reserve_rezlee_ai_attempt", { p_id: id, p_feature: feature, p_model: resolved.modelId });
      observe?.({stage: "reserve", elapsedMs: Date.now() - started, success: !r.error && r.data === "allowed"});
      if (r.error || r.data !== "allowed") return false;
      return { settle: async usage => {
        const tokens = completeUsage(usage); if (!tokens) return;
        const settleStarted = Date.now();
        const result = await db.rpc("settle_rezlee_ai_attempt", { p_id: id, p_input_tokens: tokens.input, p_output_tokens: tokens.output });
        observe?.({stage: "settle", elapsedMs: Date.now() - settleStarted, success: !result.error && ["settled", "already_settled", "overrun"].includes(result.data)});
        if (result.error || !["settled", "already_settled", "overrun"].includes(result.data)) throw Error("Spend settlement unavailable");
      }, failed: async error => {
        const verified = verifiedZeroCostRejection(error);
        // Emit only fixed classifications. Never include message/body, user identity or prompt.
        console.warn(JSON.stringify({ event: "ai_attempt_failed", feature, zeroCostReceiptVerified: verified }));
        if (!verified) return;
        const result = await db.rpc("settle_rezlee_ai_attempt", { p_id: id, p_input_tokens: 0, p_output_tokens: 0 });
        if (result.error || !["settled", "already_settled"].includes(result.data)) throw Error("Rejected attempt reconciliation unavailable");
      } };
    } catch { observe?.({stage: "reserve", elapsedMs: Date.now() - started, success: false}); return false; }
  })] });
}
