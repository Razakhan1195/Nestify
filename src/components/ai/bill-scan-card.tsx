"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, RotateCcw, Sparkles, Upload } from "lucide-react";

import { createManualBill } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Fields = {
  bill_title: string;
  category: string;
  provider_name: string;
  amount: string;
  due_date: string;
  issue_date: string;
  frequency: string;
  account_number: string;
  notes: string;
};

const EMPTY: Fields = {
  bill_title: "",
  category: "",
  provider_name: "",
  amount: "",
  due_date: "",
  issue_date: "",
  frequency: "",
  account_number: "",
  notes: "",
};

function clean(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function mapResult(data: Record<string, unknown>): Fields {
  return {
    bill_title: clean(data.bill_title) || clean(data.provider),
    category: clean(data.category),
    provider_name: clean(data.provider),
    amount: clean(data.amount),
    due_date: clean(data.due_date),
    issue_date: clean(data.issue_date),
    frequency: clean(data.billing_cycle),
    account_number: clean(data.account_number),
    notes: clean(data.notes),
  };
}

export function BillScanCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStatus("scanning");
    setError(null);
    setFileName(file.name);
    const body = new FormData();
    body.append("file", file);
    body.append("kind", "bill");

    try {
      const res = await fetch("/api/ai/scan", { method: "POST", body });
      const json = (await res.json()) as { data?: Record<string, unknown>; error?: string };
      if (!res.ok || !json.data) {
        setError(json.error ?? "We couldn't read that bill. Try a clearer photo or enter it manually below.");
        setStatus("idle");
        return;
      }
      setFields(mapResult(json.data));
      setStatus("ready");
    } catch {
      setError("Something went wrong. Please try again or enter the bill manually.");
      setStatus("idle");
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setFields(EMPTY);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-accent/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold leading-tight">Upload a bill, let AI fill it in</p>
          <p className="text-sm leading-snug text-muted-foreground">
            Drop a bill PDF or photo. We&apos;ll read the provider, amount, due date, and account
            number so you can confirm in seconds.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        type="file"
      />

      {status === "idle" ? (
        <div className="mt-4 flex flex-col gap-2">
          <Button className="w-fit gap-2" onClick={() => inputRef.current?.click()} type="button">
            <Upload className="size-4" />
            Upload bill (PDF or photo)
          </Button>
          <p className="text-xs text-muted-foreground">
            Your file is read once to extract details and is not stored.
          </p>
          {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
        </div>
      ) : null}

      {status === "scanning" ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border bg-card p-4">
          <Loader2 className="size-5 animate-spin text-primary" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Reading your bill…</span>
            <span className="text-xs text-muted-foreground">
              Extracting provider, amount, and due date from {fileName}
            </span>
          </div>
        </div>
      ) : null}

      {status === "ready" ? (
        <form action={createManualBill} className="mt-4 grid gap-4 sm:grid-cols-2" key={fileName ?? "scan"}>
          <input name="provider_id" type="hidden" value="" />
          <div className="sm:col-span-2 flex items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
            <span className="flex items-center gap-2 text-sm text-success-foreground">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                Read from <span className="font-medium">{fileName}</span>. Review and confirm before
                saving.
              </span>
            </span>
            <Button className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={reset} size="sm" type="button" variant="ghost">
              <RotateCcw className="size-3.5" />
              Start over
            </Button>
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="scan-bill-title">Bill name</Label>
            <Input defaultValue={fields.bill_title} id="scan-bill-title" name="bill_title" placeholder="Toronto Hydro electricity" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scan-bill-provider">Provider</Label>
            <Input defaultValue={fields.provider_name} id="scan-bill-provider" name="provider_name" placeholder="Toronto Hydro" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scan-bill-category">Category</Label>
            <Input defaultValue={fields.category} id="scan-bill-category" name="category" placeholder="Electricity" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scan-bill-amount">Amount (CAD)</Label>
            <Input defaultValue={fields.amount} id="scan-bill-amount" name="amount" placeholder="162.43" required step="0.01" type="number" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scan-bill-due">Due date</Label>
            <Input defaultValue={fields.due_date} id="scan-bill-due" name="due_date" required type="date" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scan-bill-cycle">Billing cycle</Label>
            <Input defaultValue={fields.frequency} id="scan-bill-cycle" name="frequency" placeholder="monthly" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scan-bill-account">Account / reference</Label>
            <Input defaultValue={fields.account_number} id="scan-bill-account" name="account_number" placeholder="•••• 0937" />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="scan-bill-notes">Notes</Label>
            <Textarea defaultValue={fields.notes} id="scan-bill-notes" name="notes" placeholder="Anything useful to remember about this bill" />
          </div>

          <input name="issue_date" type="hidden" value={fields.issue_date} />
          <SubmitButton className="sm:col-span-2 sm:w-fit" label="Save bill" pendingLabel="Saving…" />
        </form>
      ) : null}

      {status !== "ready" ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          Prefer to type it in? Use the manual form below.
        </p>
      ) : null}
    </div>
  );
}
