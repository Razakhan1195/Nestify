"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DeckCredentialFormProps = {
  providerId: string;
};

export function DeckCredentialForm({ providerId }: DeckCredentialFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      const response = await fetch("/api/deck/create-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, providerId, username }),
      });
      const result = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "Could not save credentials.");
      }

      formRef.current?.reset();
      setMessage(result.message ?? "Credentials saved in Deck Vault.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save credentials."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit} ref={formRef}>
      <div className="grid gap-2">
        <Label htmlFor="deck-username">Durham Water username</Label>
        <Input
          autoComplete="username"
          id="deck-username"
          name="username"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="deck-password">Durham Water password</Label>
        <Input
          autoComplete="current-password"
          id="deck-password"
          name="password"
          required
          type="password"
        />
      </div>
      <Button className="h-9 w-full sm:w-auto" disabled={pending} type="submit">
        {pending ? "Saving..." : "Save to Deck Vault"}
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}
