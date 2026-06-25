import type { UIMessage } from "ai";

export type AssistantHistoryMessage = {
  content: string;
  created_at?: string;
  id: string;
  role: "user" | "assistant";
};

export type AssistantConversationSummary = {
  created_at: string;
  id: string;
  is_saved: boolean;
  last_message_at: string;
  title: string;
};

export type AssistantConversation = AssistantConversationSummary & {
  messages: AssistantHistoryMessage[];
};

export function getMessageText(message: UIMessage): string {
  if (!message.parts) return "";
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

export function messageToHistory(message: UIMessage): AssistantHistoryMessage | null {
  if (message.role !== "user" && message.role !== "assistant") return null;
  const content = getMessageText(message);
  if (!content) return null;
  return {
    content,
    id: message.id,
    role: message.role,
  };
}

export function historyToUiMessage(message: AssistantHistoryMessage): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  };
}

export function titleFromMessages(messages: AssistantHistoryMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const fallback = firstUserMessage?.content || messages[0]?.content || "Assistant chat";
  const clean = fallback.replace(/\s+/g, " ").trim();
  if (!clean) return "Assistant chat";
  return clean.length > 70 ? `${clean.slice(0, 67).trim()}...` : clean;
}
