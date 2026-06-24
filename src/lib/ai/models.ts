// Central model configuration for Nestify's AI features.
//
// Cost posture: "cheap first" for the conversational assistant. Prefer direct
// Gemini when a Google AI Studio key is present because it has a free tier with
// rate limits. Vercel AI Gateway remains the fallback for production routing.
// Extraction flows keep using the app's existing Gemini/OpenAI model choices.
export const AI_MODELS = {
  // Conversational home assistant through direct Google Generative AI.
  assistantGoogle: "gemini-2.5-flash-lite",
  // Conversational home assistant through Vercel AI Gateway.
  assistantGateway: "google/gemini-2.5-flash-lite",
  // Vision + document understanding (images and PDFs). Gemini Flash is fast,
  // cheap, and handles multi-modal file input well.
  vision: "google/gemini-2.5-flash",
  // Text-only structured reasoning (maintenance plan generation).
  text: "openai/gpt-5-mini",
} as const;

export type AiModelKey = keyof typeof AI_MODELS;
