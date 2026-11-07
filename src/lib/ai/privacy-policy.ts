import type { LanguageModelMiddleware } from "ai";

/** Saved records and conversation history can contain Gmail-derived data.
 * Keep saved, mixed and unknown-origin context on the protected route.
 * Provider credentials and unverified direct-provider fallbacks cannot bypass this boundary.
 */
export function privateAiMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    transformParams: async ({ params, model }) => {
      if (model.provider !== "gateway" || params.providerOptions?.gateway?.byok !== undefined) {
        throw new Error("Private AI processing is temporarily unavailable.");
      }
      return {
        ...params,
        providerOptions: {
          ...params.providerOptions,
          gateway: {
            ...params.providerOptions?.gateway,
            zeroDataRetention: true,
            disallowPromptTraining: true,
          },
        },
      };
    },
  };
}

/** Accept the legacy Gemini model setting while keeping routing on AI Gateway. */
export function privateGatewayModelId(modelId: string): string {
  return modelId.startsWith("gemini-") ? `google/${modelId}` : modelId;
}
