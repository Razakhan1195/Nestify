"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActionFeedbackToastProps = {
  message?: string | null;
  tone?: "success" | "error" | "warning";
  title?: string;
};

function cleanUrlParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("notice");
  url.searchParams.delete("error");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function ActionFeedbackToast({
  message,
  tone = "success",
  title,
}: ActionFeedbackToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!message) return;

    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      cleanUrlParams();
    }, tone === "success" ? 3000 : 6000);

    return () => window.clearTimeout(hideTimer);
  }, [message, tone]);

  if (!message || !visible) return null;

  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  const displayTitle =
    title ??
    (tone === "success"
      ? message
      : tone === "warning"
        ? "Review needed"
        : "Could not save");
  const showDescription = Boolean(title && title !== message);

  return (
    <div
      aria-live="polite"
      className={cn(
        "fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-2xl border bg-card p-3 shadow-lg sm:right-6 sm:left-auto sm:mx-0",
        tone === "success" && "border-[color:var(--success)]/25",
        tone === "warning" && "border-[color:var(--warning)]/30",
        tone === "error" && "border-[color:var(--critical)]/25"
      )}
      role="status"
    >
      <div className="flex gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            tone === "success" && "bg-[color:var(--success-bg)] text-[color:var(--success)]",
            tone === "warning" && "bg-[color:var(--warning-bg)] text-[color:var(--warning)]",
            tone === "error" && "bg-[color:var(--critical-bg)] text-[color:var(--critical)]"
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{displayTitle}</p>
          {showDescription ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{message}</p>
          ) : null}
        </div>
        <Button
          aria-label="Dismiss message"
          className="size-8 shrink-0"
          onClick={() => {
            setVisible(false);
            cleanUrlParams();
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
