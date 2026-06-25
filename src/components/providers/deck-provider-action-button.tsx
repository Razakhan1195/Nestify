"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type DeckProviderActionButtonProps = {
  action: "connect" | "sync" | "disconnect";
  children: React.ReactNode;
  providerId: string;
  restartSync?: boolean;
  variant?: "default" | "outline";
};

const endpointByAction = {
  connect: "/api/deck/create-connection",
  sync: "/api/deck/sync-provider",
  disconnect: "/api/deck/disconnect-provider",
} as const;

const pendingLabelByAction = {
  connect: "Connecting...",
  sync: "Retrying...",
  disconnect: "Disconnecting...",
} as const;

export function DeckProviderActionButton({
  action,
  children,
  providerId,
  restartSync = false,
  variant = "default",
}: DeckProviderActionButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function runAction() {
    if (
      action === "disconnect" &&
      !window.confirm(
        "Disconnect this provider? Historical bills and records will stay in Nestify, but automatic syncing will stop."
      )
    ) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch(endpointByAction[action], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, restart: restartSync }),
      });
      const result = (await response.json()) as {
        message?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "Provider action failed.");
      }

      if (
        result.status === "requires_user_action" ||
        result.status === "mfa_required"
      ) {
        router.push(
          `/app/providers/${providerId}?notice=${encodeURIComponent(
            result.message ??
              "Deck needs one more verification step before syncing can continue."
          )}`
        );
        return;
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
      {pending ? pendingLabelByAction[action] : children}
    </Button>
  );
}
