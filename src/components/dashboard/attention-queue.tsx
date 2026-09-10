import Link from "next/link";

import { completeMaintenanceTask } from "@/app/actions";
import {
  AttentionActionMenu,
  MarkBillPaidAction,
} from "@/components/product/attention-action-menu";
import { SecondaryCTA } from "@/components/product/design-system";
import { SectionCard } from "@/components/section-card";
import { SubmitButton } from "@/components/submit-button";

export type AttentionItem = {
  billId?: string | null;
  documentId?: string | null;
  eventType: string;
  issueId?: string | null;
  key: string;
  providerId?: string | null;
  relatedTable?: string | null;
  taskId?: string | null;
  title: string;
  explanation: string;
  severity: "high" | "medium" | "low";
  cta: string;
  href: string;
  meta?: string;
};

export function isPayableAttention(item: AttentionItem) {
  return Boolean(
    item.billId && ["bill_overdue", "bill_due_soon"].includes(item.eventType),
  );
}

export function primaryAttentionAction(item: AttentionItem) {
  if (item.eventType === "bill_overdue" && item.billId) {
    return (
      <MarkBillPaidAction
        attentionKey={item.key}
        billId={item.billId}
        eventType={item.eventType}
        returnPath="/app"
      />
    );
  }

  if (item.eventType === "maintenance_due" && item.taskId) {
    return (
      <form action={completeMaintenanceTask}>
        <input name="attention_key" type="hidden" value={item.key} />
        <input name="event_type" type="hidden" value={item.eventType} />
        <input name="return_path" type="hidden" value="/app" />
        <input name="task_id" type="hidden" value={item.taskId} />
        <SubmitButton
          label="Complete"
          pendingLabel="Completing..."
          size="sm"
          variant="outline"
        />
      </form>
    );
  }

  return (
    <SecondaryCTA asChild size="sm">
      <Link href={item.href}>{item.cta}</Link>
    </SecondaryCTA>
  );
}

export function AttentionQueue({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;

  return (
    <SectionCard
      title="Also needs a look"
      description="Open actions, ordered by urgency"
      action={
        <Link className="text-sm font-medium text-primary" href="/app/attention">
          View all
        </Link>
      }
    >
      <div className="divide-y">
        {items.map((item) => (
          <div
            className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start"
            key={item.key}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.explanation}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {primaryAttentionAction(item)}
              <AttentionActionMenu
                showMarkPaid={isPayableAttention(item)}
                context={{
                  attentionKey: item.key,
                  billId: item.billId,
                  eventType: item.eventType,
                  providerId: item.providerId,
                  relatedId: item.taskId ?? item.documentId ?? item.issueId,
                  relatedTable: item.relatedTable,
                  returnPath: "/app",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
