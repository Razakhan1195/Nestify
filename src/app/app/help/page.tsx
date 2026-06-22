import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  LifeBuoy,
  Wrench,
} from "lucide-react";
import { redirect } from "next/navigation";

import {
  addRepairIssueNote,
  createCareTaskFromIssue,
  resolveRepairIssue,
} from "@/app/actions";
import { GuidedIssueCheck } from "@/components/issues/guided-issue-check";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import {
  EmptyState,
  InsightCard,
  MetricCard,
  PageHeader,
  PageSection,
  PageShell,
  ProductCard,
  SecondaryCTA,
  SectionHeader,
  StatusBadge,
} from "@/components/product/design-system";
import { MigrationRequiredCard } from "@/components/product/migration-required-card";
import { SubmitButton } from "@/components/submit-button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  categoryLabel,
  isUrgentIssue,
  urgencyLabel,
} from "@/lib/issues/guidance";
import { requireCurrentUserHome } from "@/lib/homes";
import {
  guidedIssueHelpMigrationMessage,
  guidedIssueHelpMigrationPath as schemaMigrationPath,
  isMissingSchemaError,
} from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

type HelpPageProps = {
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

type IssueRow = {
  category: string | null;
  created_at: string;
  description: string | null;
  escalation_recommendation: string | null;
  id: string;
  likely_causes: string[] | null;
  location: string | null;
  recommended_steps: string[] | null;
  related_task_id: string | null;
  resolved_at: string | null;
  safety_notes: string[] | null;
  status: string;
  title: string;
  urgency: string;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function issueStatusLabel(status: string) {
  if (status === "next_steps_ready") return "Next steps ready";
  if (status === "task_created") return "Task created";
  if (status === "waiting_on_landlord") return "Waiting on landlord";
  if (status === "waiting_on_professional") return "Waiting on professional";
  return status.replaceAll("_", " ");
}

function listItems(items: string[] | null | undefined, fallback: string) {
  const rows = items?.length ? items : [fallback];
  return (
    <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
      {rows.map((item) => (
        <li key={item}>- {item}</li>
      ))}
    </ul>
  );
}

function IssueActions({ issue }: { issue: IssueRow }) {
  const hasTask = Boolean(issue.related_task_id);

  return (
    <div className="flex flex-wrap gap-2">
      {!hasTask && issue.status !== "resolved" ? (
        <form action={createCareTaskFromIssue}>
          <input name="issue_id" type="hidden" value={issue.id} />
          <input name="return_path" type="hidden" value="/app/help" />
          <SubmitButton
            label="Create Care task"
            pendingLabel="Creating task..."
            size="sm"
          >
            <Wrench className="size-4" />
          </SubmitButton>
        </form>
      ) : null}
      {hasTask ? (
        <SecondaryCTA asChild size="sm">
          <Link href="/app/maintenance">Open Care</Link>
        </SecondaryCTA>
      ) : null}
      {issue.status !== "resolved" ? (
        <form action={resolveRepairIssue}>
          <input name="issue_id" type="hidden" value={issue.id} />
          <input name="return_path" type="hidden" value="/app/help" />
          <SubmitButton
            label="Mark resolved"
            pendingLabel="Saving..."
            size="sm"
            variant="outline"
          >
            <CheckCircle2 className="size-4" />
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function IssueRowCard({ issue }: { issue: IssueRow }) {
  const urgent = isUrgentIssue({
    category: issue.category,
    description: issue.description,
    title: issue.title,
    urgency: issue.urgency,
  });

  return (
    <ProductCard variant="record">
      <CardContent className="grid gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={urgencyLabel(issue.urgency)} />
              <StatusBadge value={issueStatusLabel(issue.status)} />
              {urgent ? <StatusBadge value="Review soon" /> : null}
            </div>
            <h3 className="mt-2 text-base font-semibold">{issue.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {categoryLabel(issue.category)} · {issue.location ?? "Location not set"} ·{" "}
              {formatDate(issue.created_at)}
            </p>
          </div>
          <IssueActions issue={issue} />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border bg-muted/10 p-3">
            <p className="text-sm font-medium">Possible causes</p>
            {listItems(
              issue.likely_causes,
              "Track what changed and review if it keeps happening."
            )}
          </div>
          <div className="rounded-2xl border bg-muted/10 p-3">
            <p className="text-sm font-medium">Safe first steps</p>
            {listItems(
              issue.recommended_steps,
              "Avoid unsafe DIY and create a follow-up task if needed."
            )}
          </div>
          <div className="rounded-2xl border bg-muted/10 p-3">
            <p className="text-sm font-medium">When to call someone</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {issue.escalation_recommendation ??
                "Contact a landlord, property manager, or qualified professional if it feels unsafe or keeps happening."}
            </p>
          </div>
        </div>

        <details className="rounded-2xl border bg-background p-3">
          <summary className="cursor-pointer text-sm font-medium">Add note</summary>
          <form action={addRepairIssueNote} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input name="issue_id" type="hidden" value={issue.id} />
            <input name="return_path" type="hidden" value="/app/help" />
            <div className="grid gap-2">
              <Label htmlFor={`note-${issue.id}`}>Note</Label>
              <Input
                id={`note-${issue.id}`}
                name="note"
                placeholder="Called landlord, checked filter, noticed leak spreading..."
                required
              />
            </div>
            <SubmitButton
              className="self-end"
              label="Add note"
              pendingLabel="Saving..."
              variant="outline"
            />
          </form>
        </details>
      </CardContent>
    </ProductCard>
  );
}

export default async function HelpPage({ searchParams }: HelpPageProps) {
  const [{ error: pageError, notice }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const home = await requireCurrentUserHome(user.id);
  const { data, error } = await supabase
    .from("repair_issues")
    .select(
      "id,title,description,category,location,urgency,status,likely_causes,recommended_steps,safety_notes,escalation_recommendation,related_task_id,resolved_at,created_at"
    )
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("created_at", { ascending: false });

  const migrationRequired = isMissingSchemaError(error);
  const pageErrorMessage =
    typeof pageError === "string"
      ? pageError.includes("migration")
        ? pageError
        : "Couldn't save. Try again."
      : null;
  const issues = (data ?? []) as unknown as IssueRow[];
  const openIssues = issues.filter(
    (issue) => !["resolved", "dismissed"].includes(issue.status)
  );
  const resolvedIssues = issues.filter((issue) => issue.status === "resolved").slice(0, 5);
  const urgentOpenIssues = openIssues.filter((issue) =>
    isUrgentIssue({
      category: issue.category,
      description: issue.description,
      title: issue.title,
      urgency: issue.urgency,
    })
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Help"
        title="Get help with a household issue"
        description="Describe what is going on. Nestify will help you organize the issue, suggest safe next steps, and track the follow-up."
        actions={
          <SecondaryCTA asChild>
            <a href="#start-issue-check">Start issue check</a>
          </SecondaryCTA>
        }
      />

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />
      <ActionFeedbackToast message={pageErrorMessage} tone="error" />

      {pageErrorMessage ? (
        <InsightCard
          description={pageErrorMessage}
          icon={AlertCircle}
          severity="critical"
          title="Could not save"
        />
      ) : null}

      {migrationRequired ? (
        <MigrationRequiredCard
          detail="Help needs the guided issue columns before Nestify can save causes, safety steps, follow-up tasks, and resolved state."
          error={error}
          migrationPath={schemaMigrationPath}
        />
      ) : error ? (
        <InsightCard
          description={
            isMissingSchemaError(error)
              ? guidedIssueHelpMigrationMessage
              : "Couldn't load issues. Try refreshing."
          }
          icon={AlertCircle}
          severity="critical"
          title="Could not load issues"
        />
      ) : null}

      {!migrationRequired ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard
              description="Issues being tracked"
              icon={ClipboardList}
              title={openIssues.length.toString()}
            />
            <MetricCard
              description="May need faster follow-up"
              icon={AlertTriangle}
              title={urgentOpenIssues.length.toString()}
            />
            <MetricCard
              description="Recently handled"
              icon={CheckCircle2}
              title={resolvedIssues.length.toString()}
            />
          </div>

          <GuidedIssueCheck />

          <PageSection>
            <SectionHeader
              title="Open issues"
              description="Household issues you are tracking, with next steps and follow-up actions."
            />
            {openIssues.length ? (
              <div className="grid gap-3">
                {openIssues.map((issue) => (
                  <IssueRowCard issue={issue} key={issue.id} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={LifeBuoy}
                title="No open issues"
                description="No issues yet. Start an issue check when something needs attention."
                action={
                  <SecondaryCTA asChild>
                    <a href="#start-issue-check">Start issue check</a>
                  </SecondaryCTA>
                }
              />
            )}
          </PageSection>

          <PageSection>
            <SectionHeader
              title="Recently resolved"
              description="Issues you have marked resolved."
            />
            {resolvedIssues.length ? (
              <ProductCard variant="record">
                <CardContent className="grid gap-0 p-2">
                  {resolvedIssues.map((issue) => (
                    <div
                      className="grid gap-2 border-b border-border/60 px-2 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
                      key={issue.id}
                    >
                      <div>
                        <p className="font-medium">{issue.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {categoryLabel(issue.category)} · Resolved{" "}
                          {formatDate(issue.resolved_at)}
                        </p>
                      </div>
                      <StatusBadge value="Resolved" />
                    </div>
                  ))}
                </CardContent>
              </ProductCard>
            ) : (
              <p className="text-sm text-muted-foreground">
                No resolved issues yet.
              </p>
            )}
          </PageSection>

          <ProductCard variant="warning">
            <CardContent className="flex gap-3 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                For immediate danger, gas smell, smoke, carbon monoxide alarms,
                active flooding, live electrical concerns, or structural danger,
                leave the area and contact emergency services or the appropriate
                professional.
              </p>
            </CardContent>
          </ProductCard>
        </>
      ) : null}
    </PageShell>
  );
}
