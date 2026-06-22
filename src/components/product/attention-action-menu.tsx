import { CheckCircle2, MoreHorizontal } from "lucide-react";

import { markBillPaid, resolveAttentionItem } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

export type AttentionActionContext = {
  attentionKey: string;
  billId?: string | null;
  eventType: string;
  providerId?: string | null;
  relatedId?: string | null;
  relatedTable?: string | null;
  returnPath: string;
};

function relatedIdFor(context: AttentionActionContext) {
  return context.relatedId ?? context.billId ?? context.providerId ?? "";
}

function relatedTableFor(context: AttentionActionContext) {
  if (context.relatedTable) return context.relatedTable;
  if (context.billId) return "bills";
  if (context.providerId) return "providers";
  return "";
}

function HiddenResolutionFields({
  context,
}: {
  context: AttentionActionContext;
}) {
  return (
    <>
      <input name="attention_key" type="hidden" value={context.attentionKey} />
      <input name="event_type" type="hidden" value={context.eventType} />
      <input name="related_table" type="hidden" value={relatedTableFor(context)} />
      <input name="related_id" type="hidden" value={relatedIdFor(context)} />
      <input name="return_path" type="hidden" value={context.returnPath} />
    </>
  );
}

function handledLabelFor(eventType: string) {
  if (eventType === "bill_amount_increased" || eventType === "bill_amount_decreased") {
    return "Mark reviewed";
  }
  if (eventType === "due_date_missing") return "Mark handled";
  if (eventType === "maintenance_due") return "Mark complete elsewhere";
  if (eventType === "provider_needs_connection") return "Not now";
  if (eventType === "provider_sync_failed") return "Mark handled";
  if (eventType === "missing_expected_bill") return "Mark reviewed";
  if (eventType === "document_review") return "Mark reviewed";
  return "Mark reviewed";
}

function dismissLabelFor(eventType: string) {
  if (eventType === "provider_needs_connection") return "Dismiss setup reminder";
  if (eventType === "maintenance_due") return "Skip";
  return "Dismiss";
}

export function MarkBillPaidAction({
  attentionKey,
  billId,
  eventType,
  label = "I paid this",
  pendingLabel = "Marking paid...",
  returnPath,
}: {
  attentionKey?: string;
  billId: string;
  eventType?: string;
  label?: string;
  pendingLabel?: string;
  returnPath: string;
}) {
  return (
    <form action={markBillPaid}>
      <input name="bill_id" type="hidden" value={billId} />
      <input name="attention_key" type="hidden" value={attentionKey ?? ""} />
      <input name="event_type" type="hidden" value={eventType ?? "bill_paid"} />
      <input name="return_path" type="hidden" value={returnPath} />
      <SubmitButton label={label} pendingLabel={pendingLabel} size="sm" variant="outline">
        <CheckCircle2 className="size-4" />
      </SubmitButton>
    </form>
  );
}

export function AttentionActionMenu({
  context,
  showMarkPaid = false,
}: {
  context: AttentionActionContext;
  showMarkPaid?: boolean;
}) {
  return (
    <details className="relative">
      <summary className="flex h-9 cursor-pointer list-none items-center justify-center rounded-lg border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted/40">
        <MoreHorizontal className="size-4" />
        <span className="sr-only">More actions</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 grid w-48 gap-1 rounded-xl border bg-popover p-1.5 text-sm shadow-lg">
        {showMarkPaid && context.billId ? (
          <form action={markBillPaid}>
            <input name="bill_id" type="hidden" value={context.billId} />
            <input name="attention_key" type="hidden" value={context.attentionKey} />
            <input name="event_type" type="hidden" value={context.eventType} />
            <input name="return_path" type="hidden" value={context.returnPath} />
            <SubmitButton
              className="h-auto w-full justify-start rounded-lg px-2.5 py-2"
              label="I paid this"
              pendingLabel="Marking paid..."
              variant="ghost"
            />
          </form>
        ) : null}
        {context.eventType !== "maintenance_due" ? (
          <form action={resolveAttentionItem}>
            <HiddenResolutionFields context={context} />
            <input name="resolution_action" type="hidden" value="handled" />
            <SubmitButton
              className="h-auto w-full justify-start rounded-lg px-2.5 py-2"
              label={handledLabelFor(context.eventType)}
              pendingLabel="Saving..."
              variant="ghost"
            />
          </form>
        ) : null}
        <form action={resolveAttentionItem}>
          <HiddenResolutionFields context={context} />
          <input name="resolution_action" type="hidden" value="snooze" />
          <input name="snooze_for" type="hidden" value="tomorrow" />
          <SubmitButton
            className="h-auto w-full justify-start rounded-lg px-2.5 py-2"
            label="Remind me tomorrow"
            pendingLabel="Snoozing..."
            variant="ghost"
          />
        </form>
        <form action={resolveAttentionItem}>
          <HiddenResolutionFields context={context} />
          <input name="resolution_action" type="hidden" value="snooze" />
          <input name="snooze_for" type="hidden" value="week" />
          <SubmitButton
            className="h-auto w-full justify-start rounded-lg px-2.5 py-2"
            label="Remind me next week"
            pendingLabel="Snoozing..."
            variant="ghost"
          />
        </form>
        <form action={resolveAttentionItem}>
          <HiddenResolutionFields context={context} />
          <input name="resolution_action" type="hidden" value="snooze" />
          <input name="snooze_for" type="hidden" value="month" />
          <SubmitButton
            className="h-auto w-full justify-start rounded-lg px-2.5 py-2"
            label="Remind me next month"
            pendingLabel="Snoozing..."
            variant="ghost"
          />
        </form>
        <form action={resolveAttentionItem}>
          <HiddenResolutionFields context={context} />
          <input name="resolution_action" type="hidden" value="dismiss" />
          <SubmitButton
            className="h-auto w-full justify-start rounded-lg px-2.5 py-2 text-muted-foreground"
            label={dismissLabelFor(context.eventType)}
            pendingLabel="Dismissing..."
            variant="ghost"
          />
        </form>
      </div>
    </details>
  );
}
