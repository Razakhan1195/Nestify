"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  Bookmark,
  Check,
  History,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getMessageText,
  historyToUiMessage,
  type AssistantConversation,
  type AssistantConversationSummary,
} from "@/lib/assistant/history";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "What needs my attention this week?",
  "What should I budget for a bathroom renovation?",
  "What home maintenance should I be doing this season?",
  "What should I ask a contractor before getting a quote?",
];

type AssistantChatProps = {
  greeting: string;
  initialConversations: AssistantConversationSummary[];
  historyMessage?: string | null;
  historyReady: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

/** Renders assistant text with in-app links and **bold** segments. */
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex}>
          {renderInline(line)}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

function renderInline(text: string) {
  // Split on in-app paths like /app/bills and **bold**
  const pattern = /(\/app\/[a-z/-]*|\*\*[^*]+\*\*)/g;
  const segments = text.split(pattern);
  return segments.map((segment, index) => {
    if (!segment) return null;
    if (segment.startsWith("/app/")) {
      const href = segment.replace(/[.,)]+$/, "");
      return (
        <Link
          className="font-medium text-primary underline underline-offset-2"
          href={href}
          key={index}
        >
          {segment}
        </Link>
      );
    }
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return (
        <strong className="font-semibold" key={index}>
          {segment.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{segment}</span>;
  });
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function titleFromMessages(messages: UIMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const fallback = firstUserMessage ? getMessageText(firstUserMessage) : "Assistant chat";
  const clean = fallback.replace(/\s+/g, " ").trim();
  if (!clean) return "Assistant chat";
  return clean.length > 70 ? `${clean.slice(0, 67).trim()}...` : clean;
}

export function AssistantChat({
  greeting,
  historyMessage,
  historyReady,
  initialConversations,
}: AssistantChatProps) {
  const [input, setInput] = useState("");
  const [conversations, setConversations] =
    useState<AssistantConversationSummary[]>(initialConversations);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isCurrentSaved, setIsCurrentSaved] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [historyError, setHistoryError] = useState<string | null>(historyMessage ?? null);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function persistConversation(options: {
    messages: UIMessage[];
    saved?: boolean;
    silent?: boolean;
  }) {
    const usefulMessages = options.messages.filter((message) => getMessageText(message));
    if (!historyReady || usefulMessages.length === 0) return null;

    if (!options.silent) {
      setSaveState("saving");
    }

    try {
      const response = await fetch("/api/assistant/conversations", {
        body: JSON.stringify({
          conversationId: currentConversationIdRef.current,
          messages: usefulMessages,
          saved: options.saved === true,
          title: titleFromMessages(usefulMessages),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        conversation?: AssistantConversationSummary;
        error?: string;
      };

      if (!response.ok || !payload.conversation) {
        throw new Error(payload.error ?? "Could not save the chat.");
      }

      currentConversationIdRef.current = payload.conversation.id;
      setCurrentConversationId(payload.conversation.id);
      setIsCurrentSaved(payload.conversation.is_saved);
      setConversations((previous) => [
        payload.conversation!,
        ...previous.filter((conversation) => conversation.id !== payload.conversation!.id),
      ]);
      setHistoryError(null);
      if (!options.silent) {
        setSaveState("saved");
      }
      return payload.conversation;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the chat.";
      setHistoryError(message);
      if (!options.silent) {
        setSaveState("error");
      }
      return null;
    }
  }

  const { messages, sendMessage, status, setMessages, error } = useChat({
    onFinish: ({ messages: finishedMessages }) => {
      void persistConversation({ messages: finishedMessages, silent: true });
    },
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
  });

  const isBusy = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ behavior: "smooth", top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  useEffect(() => {
    if (saveState !== "saved" && saveState !== "error") return;
    const timeout = window.setTimeout(() => setSaveState("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [saveState]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    setSaveState("idle");
    sendMessage({ text: trimmed });
    setInput("");
  }

  function newConversation() {
    if (isBusy) return;
    currentConversationIdRef.current = null;
    setCurrentConversationId(null);
    setIsCurrentSaved(false);
    setSaveState("idle");
    setMessages([]);
  }

  async function openConversation(conversationId: string) {
    if (isBusy || loadingConversationId) return;
    setLoadingConversationId(conversationId);
    try {
      const response = await fetch("/api/assistant/conversations", {
        body: JSON.stringify({ conversationId }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      const payload = (await response.json()) as {
        conversation?: AssistantConversation;
        error?: string;
      };
      if (!response.ok || !payload.conversation) {
        throw new Error(payload.error ?? "Could not open that chat.");
      }

      currentConversationIdRef.current = payload.conversation.id;
      setCurrentConversationId(payload.conversation.id);
      setIsCurrentSaved(payload.conversation.is_saved);
      setMessages(payload.conversation.messages.map(historyToUiMessage));
      setHistoryError(null);
      setSaveState("idle");
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not open that chat.");
    } finally {
      setLoadingConversationId(null);
    }
  }

  async function saveCurrentChat() {
    const saved = await persistConversation({ messages, saved: true });
    if (saved) {
      setIsCurrentSaved(true);
    }
  }

  async function deleteConversation(conversationId: string) {
    if (deletingConversationId) return;
    setDeletingConversationId(conversationId);
    try {
      const response = await fetch(`/api/assistant/conversations?id=${conversationId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not delete that chat.");
      }
      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== conversationId)
      );
      if (currentConversationId === conversationId) {
        newConversation();
      }
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not delete that chat.");
    } finally {
      setDeletingConversationId(null);
    }
  }

  return (
    <div className="grid min-h-[34rem] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="rounded-2xl border bg-card p-3 shadow-[var(--card-shadow-soft)] lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <History className="size-4 text-primary" />
              Assistant history
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Recent home questions</p>
          </div>
          <Button
            aria-label="New conversation"
            className="size-8 rounded-xl"
            disabled={isBusy}
            onClick={newConversation}
            size="icon"
            type="button"
            variant="secondary"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {historyError ? (
          <div className="mt-3 rounded-xl border border-[color:var(--warning)]/25 bg-[color:var(--warning-bg)] p-3 text-xs text-[color:var(--warning)]">
            {historyError}
          </div>
        ) : null}

        <div className="mt-3 grid gap-1.5">
          {conversations.length > 0 ? (
            conversations.map((conversation) => {
              const isActive = conversation.id === currentConversationId;
              const isLoading = conversation.id === loadingConversationId;
              return (
                <div
                  className={cn(
                    "group grid grid-cols-[1fr_auto] gap-1 rounded-xl border border-transparent p-1.5",
                    isActive ? "border-primary/20 bg-primary/5" : "hover:bg-muted/35"
                  )}
                  key={conversation.id}
                >
                  <button
                    className="min-w-0 rounded-lg px-2 py-1.5 text-left"
                    disabled={isBusy || isLoading}
                    onClick={() => void openConversation(conversation.id)}
                    type="button"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      {conversation.is_saved ? <Bookmark className="size-3 text-primary" /> : null}
                      <span className="truncate">{conversation.title}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {isLoading ? "Opening..." : formatHistoryDate(conversation.last_message_at)}
                    </span>
                  </button>
                  <button
                    aria-label={`Delete ${conversation.title}`}
                    className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-100 transition-colors hover:bg-background hover:text-[color:var(--critical)] sm:opacity-0 sm:group-hover:opacity-100"
                    disabled={deletingConversationId === conversation.id}
                    onClick={() => void deleteConversation(conversation.id)}
                    type="button"
                  >
                    {deletingConversationId === conversation.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              Your assistant questions will appear here after the first reply.
            </div>
          )}
        </div>
      </aside>

      <div className="flex h-[calc(100vh-9rem)] min-h-[32rem] flex-col overflow-hidden rounded-2xl border bg-card shadow-[var(--card-shadow-soft)]">
        <div className="flex items-center justify-between gap-3 border-b bg-background/70 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="size-4 text-primary" />
              {currentConversationId ? "Conversation" : "New conversation"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {isCurrentSaved ? "Saved to your assistant history" : "Ask, then save anything worth keeping"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasMessages ? (
              <button
                className="hidden items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
                disabled={isBusy}
                onClick={newConversation}
                type="button"
              >
                <RotateCcw className="size-3" />
                New
              </button>
            ) : null}
            <Button
              className="rounded-xl"
              disabled={!hasMessages || isBusy || saveState === "saving" || !historyReady}
              onClick={() => void saveCurrentChat()}
              size="sm"
              type="button"
              variant={isCurrentSaved ? "secondary" : "default"}
            >
              {saveState === "saving" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : saveState === "saved" || isCurrentSaved ? (
                <Check className="size-4" />
              ) : (
                <Bookmark className="size-4" />
              )}
              {isCurrentSaved ? "Saved" : saveState === "saved" ? "Saved" : "Save chat"}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" ref={scrollRef}>
          {!hasMessages ? (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-6" />
              </span>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold tracking-tight text-balance">{greeting}</h2>
                <p className="text-sm text-muted-foreground text-pretty">
                  Ask me about bills, maintenance, documents, renovations, rough project costs,
                  contractor questions, or anything about keeping your home running. I can see
                  what you&apos;ve added to Nestify.
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    className="rounded-xl border bg-background px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-accent/40"
                    key={suggestion}
                    onClick={() => submit(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-5">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const text = getMessageText(message);
                return (
                  <div
                    className={isUser ? "flex justify-end" : "flex justify-start"}
                    key={message.id}
                  >
                    <div
                      className={
                        isUser
                          ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground"
                          : "max-w-[90%] rounded-2xl rounded-bl-sm bg-muted/50 px-4 py-3 text-sm leading-relaxed text-foreground"
                      }
                    >
                      {text ? (
                        <RichText text={text} />
                      ) : (
                        <span className="text-muted-foreground">Thinking...</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {status === "submitted" ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-muted/50 px-4 py-3">
                    <span className="flex gap-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
                    </span>
                  </div>
                </div>
              ) : null}
              {error ? (
                <div className="flex justify-start">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-[color:var(--critical-bg)] px-4 py-3 text-sm text-[color:var(--critical-foreground)]">
                    Something went wrong reaching the assistant. Please try again.
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t bg-background/80 px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submit(input);
              }}
            >
              <textarea
                className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/40"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit(input);
                  }
                }}
                placeholder="Ask about your home..."
                rows={1}
                value={input}
              />
              <Button
                aria-label="Send message"
                className="size-11 shrink-0 rounded-xl"
                disabled={!input.trim() || isBusy}
                size="icon"
                type="submit"
              >
                <ArrowUp className="size-5" />
              </Button>
            </form>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Estimates are planning ranges, not quotes. For emergencies, contact a professional.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
