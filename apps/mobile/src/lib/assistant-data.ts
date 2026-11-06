import { apiPost } from "@/lib/api";

export type AssistantReference = { id: string; label: string; href: string };
export type AssistantMessage = {
  references?: AssistantReference[];
  id: string;
  role: "user" | "assistant";
  text: string;
};

type AssistantResponse = {
  reply: string;
  references?: AssistantReference[];
};

export async function askRezlee(messages: AssistantMessage[]) {
  return apiPost<AssistantResponse>("/api/mobile/v1/assistant", {
    messages: messages.slice(-24).map(({ role, text }) => ({ role, text })),
  });
}

export const askRezleeSuggestions = [
  "What needs my attention right now?",
  "Why are my home costs changing?",
  "What should I take care of this month?",
] as const;
