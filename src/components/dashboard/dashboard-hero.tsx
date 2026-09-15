import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import { AttentionActionMenu } from "@/components/product/attention-action-menu";
import { InsightCard } from "@/components/product/design-system";
import type { AttentionItem } from "@/components/dashboard/attention-queue";

export function DashboardHero({
  dashboardState,
  hasLoadError,
  hasAttentionResolutionError,
  heroHeadline,
  heroPrimaryAction,
  heroSummary,
  homeNickname,
  notice,
  primaryAttention,
  today,
}: {
  dashboardState: string;
  hasLoadError: boolean;
  hasAttentionResolutionError: boolean;
  heroHeadline: string;
  heroPrimaryAction: ReactNode;
  heroSummary: string;
  homeNickname: string;
  notice: string | null;
  primaryAttention: AttentionItem | undefined;
  today: Date;
}) {
  return (
    <>
      <header
        data-dashboard-state={dashboardState}
        className="rounded-xl border bg-card p-5 sm:p-8"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {homeNickname} ·{" "}
          {new Intl.DateTimeFormat("en-CA", {
            month: "long",
            day: "numeric",
          }).format(today)}
        </p>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
              {hasLoadError
                ? "Part of your dashboard is unavailable."
                : heroHeadline}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              {hasLoadError
                ? "Some records could not be loaded. Refresh before relying on the totals below."
                : heroSummary}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {heroPrimaryAction}
            {primaryAttention ? (
              <AttentionActionMenu
                context={{
                  attentionKey: primaryAttention.key,
                  billId: primaryAttention.billId,
                  eventType: primaryAttention.eventType,
                  providerId: primaryAttention.providerId,
                  relatedId:
                    primaryAttention.taskId ??
                    primaryAttention.documentId ??
                    primaryAttention.issueId,
                  relatedTable: primaryAttention.relatedTable,
                  returnPath: "/app",
                }}
              />
            ) : null}
          </div>
        </div>
      </header>
      <ActionFeedbackToast message={notice} />
      {hasAttentionResolutionError ? (
        <InsightCard
          title="Some attention actions are unavailable"
          description="We could not load your saved review and snooze states. Please try again shortly."
          severity="warning"
          icon={AlertCircle}
        />
      ) : null}
    </>
  );
}
