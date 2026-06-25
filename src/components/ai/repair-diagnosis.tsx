"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ImageIcon,
  Loader2,
  RotateCcw,
  Sparkles,
  Wrench,
} from "lucide-react";

import { createProject } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Diagnosis = {
  summary: string;
  likely_causes: string[];
  steps: string[];
  safety_warnings: string[];
  recommendation: "diy" | "monitor" | "professional";
  recommendation_reason: string;
  urgency: "low" | "normal" | "high";
  suggested_title: string;
  suggested_category: string;
};

const RECO_COPY: Record<Diagnosis["recommendation"], { label: string; className: string }> = {
  diy: { label: "DIY-friendly", className: "border-success/40 bg-success/10 text-success-foreground" },
  monitor: { label: "Monitor for now", className: "border-info/40 bg-info/10 text-info-foreground" },
  professional: {
    label: "Call a professional",
    className: "border-warning/40 bg-warning/10 text-warning-foreground",
  },
};

const URGENCY_TO_PRIORITY: Record<Diagnosis["urgency"], string> = {
  low: "low",
  normal: "normal",
  high: "high",
};

export function RepairDiagnosis() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "thinking" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Diagnosis | null>(null);

  async function diagnose() {
    if (description.trim().length < 8) {
      setError("Add a little more detail about what's happening.");
      return;
    }
    setStatus("thinking");
    setError(null);
    const body = new FormData();
    body.append("description", description);
    if (location) body.append("location", location);
    const file = fileRef.current?.files?.[0];
    if (file) body.append("file", file);

    try {
      const res = await fetch("/api/ai/diagnose", { method: "POST", body });
      const json = (await res.json()) as { data?: Diagnosis; error?: string };
      if (!res.ok || !json.data) {
        setError(json.error ?? "We couldn't analyze that. Try again.");
        setStatus("idle");
        return;
      }
      setResult(json.data);
      setStatus("done");
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  function reset() {
    setResult(null);
    setStatus("idle");
    setError(null);
    setDescription("");
    setLocation("");
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (status === "done" && result) {
    const reco = RECO_COPY[result.recommendation];
    const notes = [
      result.summary,
      "",
      "Likely causes:",
      ...result.likely_causes.map((c) => `- ${c}`),
      "",
      "Steps:",
      ...result.steps.map((s, i) => `${i + 1}. ${s}`),
    ].join("\n");

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${reco.className}`}
          >
            <Wrench className="size-3.5" />
            {reco.label}
          </span>
          <Button className="h-7 gap-1 px-2 text-xs" onClick={reset} size="sm" type="button" variant="ghost">
            <RotateCcw className="size-3.5" />
            New question
          </Button>
        </div>

        <p className="text-sm leading-relaxed">{result.summary}</p>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Likely causes
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.likely_causes.map((cause) => (
              <li className="flex items-start gap-2 text-sm" key={cause}>
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {cause}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Try these steps
          </p>
          <ol className="flex flex-col gap-2">
            {result.steps.map((step, index) => (
              <li className="flex items-start gap-2.5 text-sm" key={step}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {result.safety_warnings.length ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-warning-foreground">
              <AlertTriangle className="size-3.5" />
              Safety first
            </span>
            <ul className="flex flex-col gap-1">
              {result.safety_warnings.map((warning) => (
                <li className="text-xs leading-snug text-warning-foreground" key={warning}>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="rounded-lg border bg-card p-3 text-sm">
          <span className="font-medium">Recommendation: </span>
          {result.recommendation_reason}
        </div>

        <form action={createProject} className="flex flex-col gap-2 border-t pt-4">
          <input name="title" type="hidden" value={result.suggested_title} />
          <input name="project_type" type="hidden" value={result.suggested_category} />
          <input name="room_or_area" type="hidden" value={location} />
          <input name="priority" type="hidden" value={URGENCY_TO_PRIORITY[result.urgency]} />
          <input name="status" type="hidden" value="planning" />
          <input name="notes" type="hidden" value={notes} />
          <p className="text-xs text-muted-foreground">
            Save this as a tracked repair, including the AI notes and steps.
          </p>
          <SubmitButton
            className="w-fit"
            label="Log as a repair"
            pendingLabel="Logging…"
          />
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2">
        <Label htmlFor="diag-description">What&apos;s going wrong?</Label>
        <Textarea
          id="diag-description"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="e.g. My dishwasher leaves a puddle of water on the floor after every cycle."
          rows={3}
          value={description}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="diag-location">Room or area (optional)</Label>
        <Input
          id="diag-location"
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Kitchen"
          value={location}
        />
      </div>

      <input
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        ref={fileRef}
        type="file"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="gap-1.5"
          onClick={() => fileRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          <ImageIcon className="size-4" />
          {fileName ? "Change photo" : "Add a photo (optional)"}
        </Button>
        {fileName ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-success-foreground" />
            {fileName}
          </span>
        ) : null}
      </div>

      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

      <Button className="w-fit gap-2" disabled={status === "thinking"} onClick={() => void diagnose()} type="button">
        {status === "thinking" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {status === "thinking" ? "Diagnosing…" : "Diagnose with AI"}
      </Button>
      <p className="text-xs text-muted-foreground">
        AI guidance is a helpful starting point, not a substitute for a licensed professional.
      </p>
    </div>
  );
}
