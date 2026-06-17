"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type DeckProviderActionButtonProps = {
  action: "connect" | "sync" | "disconnect";
  children: React.ReactNode;
  providerId: string;
  variant?: "default" | "outline";
};

const endpointByAction = {
  connect: "/api/deck/create-connection",
  sync: "/api/deck/sync-provider",
  disconnect: "/api/deck/disconnect-provider",
} as const;

export function DeckProviderActionButton({
  action,
  children,
  providerId,
  variant = "default",
}: DeckProviderActionButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function runAction() {
    setPending(true);

    try {
      const response = await fetch(endpointByAction[action], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const result = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "Provider action failed.");
      }

      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Provider action failed.";
      router.push(
        `/app/providers/${providerId}?error=${encodeURIComponent(message)}`
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      className="h-9 w-full sm:w-auto"
      disabled={pending}
      onClick={runAction}
      type="button"
      variant={variant}
    >
      {pending ? "Working..." : children}
    </Button>
  );
}
