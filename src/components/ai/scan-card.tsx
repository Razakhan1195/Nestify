"use client";

import { useRef, useState } from "react";
import { Loader2, RotateCcw, Sparkles, Upload } from "lucide-react";

import { createDocumentRecord, createInventoryItem } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ScanKind = "appliance" | "warranty" | "document";

type Fields = Record<string, string>;

type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "date" | "textarea";
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
};

const COPY: Record<ScanKind, { description: string; hint: string }> = {
  appliance: {
    description:
      "Snap the rating label, spec sticker, or a clear photo of the unit. We'll read the brand, model, and serial so you don't have to type them.",
    hint: "Best results: the silver/white sticker with model and serial numbers.",
  },
  warranty: {
    description:
      "Upload a warranty card, receipt, or coverage letter. We'll pull the product, provider, and expiry date.",
    hint: "A photo or PDF both work.",
  },
  document: {
    description:
      "Upload any home document. We'll name it, categorize it, and offer a reminder if it has a renewal or expiry date.",
    hint: "Insurance, warranties, manuals, receipts, permits, statements...",
  },
};

const INVENTORY_FIELDS: FieldDef[] = [
  { name: "name", label: "Name", placeholder: "e.g. Bosch dishwasher", required: true, wide: true },
  { name: "category", label: "Category", placeholder: "HVAC, Appliance, Plumbing..." },
  { name: "room_or_area", label: "Room / area", placeholder: "Kitchen" },
  { name: "brand", label: "Brand", placeholder: "Bosch" },
  { name: "model_number", label: "Model number", placeholder: "SHX..." },
  { name: "serial_number", label: "Serial number", placeholder: "FD..." },
  { name: "purchase_date", label: "Purchase date", type: "date" },
  { name: "warranty_expires_on", label: "Warranty expires", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", wide: true },
];

const DOCUMENT_FIELDS: FieldDef[] = [
  { name: "title", label: "Title", placeholder: "2026 home insurance policy", required: true, wide: true },
  { name: "category", label: "Category", placeholder: "Insurance, Warranty, Receipt..." },
  { name: "issued_on", label: "Issued on", type: "date" },
  { name: "expires_on", label: "Expires / renews", type: "date" },
  { name: "notes", label: "Summary", type: "textarea", wide: true },
];

function clean(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapResult(kind: ScanKind, data: Record<string, unknown>): Fields {
  if (kind === "document") {
    return {
      title: clean(data.title),
      category: clean(data.document_type),
      issued_on: clean(data.issued_on),
      expires_on: clean(data.expires_on),
      notes: clean(data.summary),
      reminder_suggested: data.reminder_suggested ? "1" : "",
      reminder_title: clean(data.reminder_title),
      reminder_date: clean(data.reminder_date),
    };
  }
  if (kind === "warranty") {
    const notes = [clean(data.coverage_summary), clean(data.provider) ? `Provider: ${clean(data.provider)}` : ""]
      .filter(Boolean)
      .join(" \u2014 ");
    return {
      name: clean(data.item_name),
      category: "Warranty",
      room_or_area: "",
      brand: clean(data.brand),
      model_number: clean(data.model_number),
      serial_number: clean(data.serial_number),
      purchase_date: clean(data.purchase_date),
      warranty_expires_on: clean(data.warranty_expires_on),
      notes,
    };
  }
  return {
    name: clean(data.name),
    category: clean(data.category),
    room_or_area: clean(data.room_or_area),
    brand: clean(data.brand),
    model_number: clean(data.model_number),
    serial_number: clean(data.serial_number),
    purchase_date: clean(data.purchase_date),
    warranty_expires_on: clean(data.warranty_expires_on),
    notes: clean(data.notes),
  };
}

export function ScanCard({ kind }: { kind: ScanKind }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const [remind, setRemind] = useState(false);

  const action = kind === "document" ? createDocumentRecord : createInventoryItem;
  const fieldDefs = kind === "document" ? DOCUMENT_FIELDS : INVENTORY_FIELDS;

  async function handleFile(file: File) {
    setStatus("scanning");
    setError(null);
    setFileName(file.name);
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);

    try {
      const res = await fetch("/api/ai/scan", { method: "POST", body });
      const json = (await res.json()) as { data?: Record<string, unknown>; error?: string };
      if (!res.ok || !json.data) {
        setError(json.error ?? "We couldn't read that file.");
        setStatus("idle");
        return;
      }
      const mapped = mapResult(kind, json.data);
      setFields(mapped);
      setRemind(mapped.reminder_suggested === "1");
      setStatus("ready");
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setFields({});
    setFileName(null);
    setRemind(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-accent/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold leading-tight">Scan it in with AI</p>
          <p className="text-sm leading-snug text-muted-foreground">{COPY[kind].description}</p>
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

      {status !== "ready" ? (
        <div className="mt-4 flex flex-col gap-2">
          <Button
            className="w-fit gap-2"
            disabled={status === "scanning"}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {status === "scanning" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {status === "scanning" ? "Reading..." : "Upload photo or PDF"}
          </Button>
          <p className="text-xs text-muted-foreground">{COPY[kind].hint}</p>
          {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
        </div>
      ) : (
        <form
          action={action}
          className="mt-4 grid gap-4 sm:grid-cols-2"
          key={fileName ?? "scan"}
        >
          <div className="sm:col-span-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Read from <span className="font-medium text-foreground">{fileName}</span>. Check the
              details below, then save.
            </p>
            <Button className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={reset} size="sm" type="button" variant="ghost">
              <RotateCcw className="size-3.5" />
              Scan another
            </Button>
          </div>

          {fieldDefs.map((field) => (
            <div className={field.wide ? "grid gap-2 sm:col-span-2" : "grid gap-2"} key={field.name}>
              <Label htmlFor={`scan-${kind}-${field.name}`}>{field.label}</Label>
              {field.type === "textarea" ? (
                <Textarea
                  defaultValue={fields[field.name] ?? ""}
                  id={`scan-${kind}-${field.name}`}
                  name={field.name}
                  placeholder={field.placeholder}
                />
              ) : (
                <Input
                  defaultValue={fields[field.name] ?? ""}
                  id={`scan-${kind}-${field.name}`}
                  name={field.name}
                  placeholder={field.placeholder}
                  required={field.required}
                  type={field.type === "date" ? "date" : "text"}
                />
              )}
            </div>
          ))}

          {kind === "document" ? (
            <div className="sm:col-span-2 rounded-lg border bg-card p-3">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  checked={remind}
                  className="sr-only"
                  onChange={(event) => setRemind(event.target.checked)}
                  type="checkbox"
                />
                <Checkbox checked={remind} />
                <span className="text-sm leading-snug">
                  Create a reminder for this document
                  <span className="block text-xs text-muted-foreground">
                    Adds a maintenance reminder so a renewal or expiry never slips by.
                  </span>
                </span>
              </label>
              {remind ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`scan-${kind}-reminder_title`}>Reminder</Label>
                    <Input
                      defaultValue={fields.reminder_title || fields.title || ""}
                      id={`scan-${kind}-reminder_title`}
                      name="reminder_title"
                      placeholder="Renew home insurance"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`scan-${kind}-reminder_date`}>Remind me on</Label>
                    <Input
                      defaultValue={fields.reminder_date || fields.expires_on || ""}
                      id={`scan-${kind}-reminder_date`}
                      name="reminder_date"
                      type="date"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <SubmitButton
            className="sm:col-span-2 sm:w-fit"
            label={kind === "document" ? "Save document" : "Add to home"}
            pendingLabel="Saving..."
          />
        </form>
      )}
    </div>
  );
}
