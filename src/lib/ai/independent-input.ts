import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelMiddleware } from "ai";

/** Assigned by server entry points after checking that no saved/Gmail context is loaded. */
export type AiInputSource = "protected" | "independent";
export const DIRECT_OPENAI_MODEL = "gpt-5-mini";
export const DIRECT_OPENAI_BILLING_MODEL = "openai/gpt-5-mini";

type DirectConfig = { REZLEE_OPENAI_DIRECT_ENABLED?: string; REZLEE_OPENAI_API_KEY?: string };

/** Missing configuration preserves the existing protected route. Never infer ZDR from a key. */
export function independentOpenAIModel(config: DirectConfig = { REZLEE_OPENAI_DIRECT_ENABLED: process.env.REZLEE_OPENAI_DIRECT_ENABLED, REZLEE_OPENAI_API_KEY: process.env.REZLEE_OPENAI_API_KEY }, fetcher?: typeof fetch) {
  if (config.REZLEE_OPENAI_DIRECT_ENABLED !== "true" || !config.REZLEE_OPENAI_API_KEY?.trim()) return null;
  return createOpenAI({
    apiKey: config.REZLEE_OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1",
    ...(fetcher ? { fetch: fetcher } : {}),
  }).responses(DIRECT_OPENAI_MODEL);
}

/** Stateless, single-turn processing; standard API safety retention still applies. */
export function independentAiMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    transformParams: async ({ params, model }) => {
      if (model.provider !== "openai.responses" || model.modelId !== DIRECT_OPENAI_MODEL ||
          params.tools?.length || params.headers && Object.keys(params.headers).some(key => key.toLowerCase() !== "user-agent") ||
          params.providerOptions && Object.keys(params.providerOptions).length) {
        throw new Error("This AI operation is not available.");
      }
      // A direct input must not bring a saved conversation or server-side file reference.
      const prompt = params.prompt.map(message => {
        if (message.role !== "user" && message.role !== "system") throw new Error("This AI operation is not available.");
        if (message.role === "system") return message;
        return { ...message, content: message.content.map(part => {
          if (part.type !== "file") return part;
          if (part.data instanceof URL) throw new Error("Upload the file again to read it.");
          const extension = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[part.mediaType];
          if (!extension) throw new Error("This file type is not supported.");
          return { ...part, filename: "upload." + extension };
        }) };
      });
      return { ...params, prompt, providerOptions: {
        openai: { store: false, reasoningEffort: "minimal", strictJsonSchema: true },
      } };
    },
  };
}

export function spendModelId(provider: string, modelId: string) {
  return provider === "openai.responses" && modelId === DIRECT_OPENAI_MODEL ? DIRECT_OPENAI_BILLING_MODEL : modelId;
}
