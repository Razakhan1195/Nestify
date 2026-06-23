// Central model configuration for Nestify's AI features.
//
// Cost posture: "balanced" — we use a strong, low-cost vision model for the
// one-shot extraction flows (scanning labels, receipts, warranties, documents)
// where accuracy directly removes data-entry friction, and a small reasoning
// model for text-only generation (the maintenance plan).
//
// Both providers (Google Vertex + OpenAI) are zero-config through the Vercel
// AI Gateway, so no provider API keys are required.
export const AI_MODELS = {
  // Vision + document understanding (images and PDFs). Gemini Flash is fast,
  // cheap, and handles multi-modal file input well.
  vision: "google/gemini-2.5-flash",
  // Text-only structured reasoning (maintenance plan generation).
  text: "openai/gpt-5-mini",
} as const;

export type AiModelKey = keyof typeof AI_MODELS;
