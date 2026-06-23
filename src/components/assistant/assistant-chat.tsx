"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Sparkles, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "What needs my attention this week?",
  "Which bills are coming up?",
  "What home maintenance should I be doing this season?",
  "Are any warranties or documents expiring soon?",
];

function getMessageText(message: UIMessage): string {
  if (!message.parts) return "";
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

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

export function AssistantChat({ greeting }: { greeting: string }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const isBusy = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ behavior: "smooth", top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[32rem] flex-col overflow-hidden rounded-2xl border bg-card shadow-[var(--card-shadow-soft)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" ref={scrollRef}>
        {!hasMessages ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-6" />
            </span>
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold tracking-tight text-balance">{greeting}</h2>
              <p className="text-sm text-muted-foreground text-pretty">
                Ask me about your bills, maintenance, documents, or anything about keeping your
                home running. I can see what you&apos;ve added to Nestify.
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
                      <span className="text-muted-foreground">Thinking…</span>
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

      {/* Composer */}
      <div className="border-t bg-background/80 px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {hasMessages ? (
            <button
              className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMessages([])}
              type="button"
            >
              <RotateCcw className="size-3" />
              New conversation
            </button>
          ) : null}
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
              placeholder="Ask about your home…"
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
            Nestify can make mistakes. For emergencies, contact a professional.
          </p>
        </div>
      </div>
    </div>
  );
}
