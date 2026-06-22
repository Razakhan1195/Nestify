"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeckInteraction } from "@/lib/deck/types";

type DeckInteractionFormProps = {
  interaction: DeckInteraction;
  providerId: string;
};

export function DeckInteractionForm({
  interaction,
  providerId,
}: DeckInteractionFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);

  async function checkResult() {
    setMessage(null);
    setChecking(true);

    try {
      const response = await fetch("/api/deck/sync-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const result = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "Could not check Deck result.");
      }

      setMessage(result.message ?? "Checked Deck result.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not check Deck result."
      );
    } finally {
      setChecking(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      interaction.fields.map((field) => [
        field.name,
        String(formData.get(field.name) ?? ""),
      ])
    );

    try {
      const response = await fetch("/api/deck/submit-interaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, values }),
      });
      const result = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "Could not submit verification answer.");
      }

      formRef.current?.reset();
      setMessage(result.message ?? "Verification answer submitted.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not submit verification answer."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit} ref={formRef}>
      <div>
        <p className="text-sm font-medium">
          {interaction.type.replaceAll("_", " ")}
        </p>
        <p className="text-sm text-muted-foreground">{interaction.message}</p>
        {interaction.type === "security_question" ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Deck did not provide the exact question text to Nestify. Use the
            question shown in the Deck session, then check the result here.
          </p>
        ) : null}
      </div>

      {interaction.fields.map((field) => (
        <div className="grid gap-2" key={field.name}>
          <Label htmlFor={`deck-interaction-${field.name}`}>
            {field.label}
          </Label>
          <Input
            autoComplete="one-time-code"
            id={`deck-interaction-${field.name}`}
            name={field.name}
            required
            type={field.type === "password" ? "password" : "text"}
          />
        </div>
      ))}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="h-9 w-full sm:w-auto"
          disabled={pending || checking}
          type="submit"
        >
          {pending ? "Submitting..." : "Submit answer"}
        </Button>
        <Button
          className="h-9 w-full sm:w-auto"
          disabled={pending || checking}
          onClick={checkResult}
          type="button"
          variant="outline"
        >
          {checking ? "Checking..." : "Check Deck result"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        If you already answered this in Deck and the bill was retrieved, check
        the Deck result to finish updating Nestify.
      </p>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}
