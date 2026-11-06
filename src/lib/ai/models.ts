// Central model configuration. All household AI calls use AI Gateway with
// enforced no-training and zero-data-retention routing in budgetedModel.
// Direct provider keys must not bypass the policy for Gmail-derived records.
export const AI_MODELS = {
  // Legacy unqualified model identifier; normalize to Gateway before use.
  assistantGoogle: "gemini-2.5-flash-lite",
  // Conversational home assistant through Vercel AI Gateway.
  assistantGateway: "google/gemini-2.5-flash-lite",
  // Vision + document understanding (images and PDFs). Gemini Flash is fast,
  // cheap, and handles multi-modal file input well.
  vision: "google/gemini-2.5-flash",
  // Deeper text-only structured reasoning for repair diagnosis.
  text: "openai/gpt-5-mini",
  // Fast structured generation for an interactive home-maintenance plan.
  maintenance: "google/gemini-2.5-flash",
  // Secondary fast model if the primary returns no structured output.
  maintenanceFallback: "google/gemini-2.5-flash-lite",
} as const;

export type AiModelKey = keyof typeof AI_MODELS;
