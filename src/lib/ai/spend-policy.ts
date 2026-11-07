import { spendModelId } from "./independent-input";
import type { LanguageModelMiddleware } from "ai";
import type { LanguageModelV3Usage } from "@ai-sdk/provider";
export const spendFeatures = ["assistant", "document", "repair", "gmail", "quote", "maintenance"] as const;
export type SpendFeature = typeof spendFeatures[number];
export const ALLOWED_SPEND_MODELS = new Set(["gemini-2.5-flash", "gemini-2.5-flash-lite", "google/gemini-2.5-flash", "google/gemini-2.5-flash-lite", "openai/gpt-5-mini"]);
export type SpendReservation = boolean | { settle: (usage: LanguageModelV3Usage) => Promise<void>; failed?: (error: unknown) => Promise<void> };
export function completeUsage(usage: LanguageModelV3Usage) {
  const input = usage?.inputTokens?.total, output = usage?.outputTokens?.total;
  return Number.isSafeInteger(input) && Number.isSafeInteger(output) && input! >= 0 && output! >= 0 && input! <= 2147483647 && output! <= 2147483647
    ? { input: input!, output: output! } : null;
}
export class AICapacityUnavailable extends Error {
 constructor(){super("AI capacity is unavailable. Your saved records are safe; try again later.");this.name="AICapacityUnavailable";}
}
export function isAICapacityUnavailable(error:unknown):boolean {
 let current=error;for(let depth=0;depth<6&&current&&typeof current==="object";depth++){
  if(current instanceof AICapacityUnavailable)return true;current=(current as {cause?:unknown}).cause;
 }return false;
}
/** USD1 is held before each actual attempt. Only complete provider-reported usage can settle it. */
export function spendMiddleware(reserve: () => Promise<SpendReservation>): LanguageModelMiddleware {
  const admit = async () => { const reservation = await reserve(); if (!reservation) throw new AICapacityUnavailable(); return reservation; };
  const settle = async (reservation: SpendReservation, usage: LanguageModelV3Usage) => {
    if (typeof reservation === "object" && completeUsage(usage)) {
      try { await reservation.settle(usage); } catch { /* Keep the full reservation; never discard a valid customer result because accounting is unavailable. */ }
    }
  };
  const failed = async (reservation: SpendReservation, error: unknown) => {
    if (typeof reservation === "object" && reservation.failed) { try { await reservation.failed(error); } catch { /* Preserve uncertain holds and the original customer error. */ } }
  };
  return { specificationVersion: "v3",
    transformParams: async ({ params, model }) => {
      if (!ALLOWED_SPEND_MODELS.has(spendModelId(model.provider, model.modelId)) || params.tools?.length) throw new Error("This AI operation is not available.");
      // Model routing overrides could charge an unreviewed model while settling at the original model's rate.
      if (params.providerOptions?.gateway?.models || params.providerOptions?.openrouter?.models) throw new Error("This AI operation is not available.");
      for (const message of params.prompt) {
        if (typeof message.content === "string") continue;
        for (const part of message.content) if (part.type === "file" && !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(part.mediaType)) throw new Error("This file type is not supported.");
      }
      return { ...params, maxOutputTokens: Math.min(params.maxOutputTokens ?? 5000, 5000) };
    },
    wrapGenerate: async ({ doGenerate }) => { const reservation = await admit(); try { const result = await doGenerate(); await settle(reservation, result.usage); return result; } catch (error) { await failed(reservation, error); throw error; } },
    wrapStream: async ({ doStream }) => {
      const reservation = await admit();
      let result; try { result = await doStream(); } catch (error) { await failed(reservation, error); throw error; }
      let finished = false;
      return { ...result, stream: result.stream.pipeThrough(new TransformStream({
        async transform(part, controller) {
          if (part.type === "finish" && !finished) { finished = true; await settle(reservation, part.usage); }
          controller.enqueue(part);
        },
      })) };
    },
  };
}
