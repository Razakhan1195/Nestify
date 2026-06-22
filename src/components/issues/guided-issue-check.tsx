"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Wrench } from "lucide-react";

import {
  createIssueFollowUpTask,
  createRepairIssue,
} from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ProductCard,
  SecondaryCTA,
  StatusBadge,
} from "@/components/product/design-system";
import {
  categoryLabel,
  getIssueGuidance,
  isUrgentIssue,
  issueCategories,
  issueLocations,
  issueUrgencies,
  urgencyLabel,
} from "@/lib/issues/guidance";
import { cn } from "@/lib/utils";

type IssueDraft = {
  category: string;
  description: string;
  location: string;
  renterOwnerContext: string;
  title: string;
  urgency: "low" | "medium" | "high" | "urgent";
};

const initialDraft: IssueDraft = {
  category: "plumbing",
  description: "",
  location: "kitchen",
  renterOwnerContext: "both",
  title: "",
  urgency: "medium",
};

function HiddenIssueFields({ draft, status }: { draft: IssueDraft; status?: string }) {
  return (
    <>
      <input name="title" type="hidden" value={draft.title} />
      <input name="description" type="hidden" value={draft.description} />
      <input name="category" type="hidden" value={draft.category} />
      <input name="location" type="hidden" value={draft.location} />
      <input name="urgency" type="hidden" value={draft.urgency} />
      <input name="renter_owner_context" type="hidden" value={draft.renterOwnerContext} />
      {status ? <input name="status" type="hidden" value={status} /> : null}
    </>
  );
}

function StepButton({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium",
        active
          ? "border-primary/25 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground"
      )}
    >
      {children}
    </div>
  );
}

export function GuidedIssueCheck() {
  const [draft, setDraft] = useState<IssueDraft>(initialDraft);
  const [step, setStep] = useState(1);
  const guidance = useMemo(
    () =>
      getIssueGuidance({
        category: draft.category,
        description: draft.description,
        renterOwnerContext: draft.renterOwnerContext,
        title: draft.title,
        urgency: draft.urgency,
      }),
    [draft]
  );
  const urgent = isUrgentIssue(draft);
  const canContinueFromIntro = draft.title.trim() && draft.description.trim();

  return (
    <ProductCard className="overflow-hidden" id="start-issue-check" variant="hero">
      <CardContent className="grid gap-5 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((item) => (
            <StepButton active={step === item} key={item}>
              Step {item}
            </StepButton>
          ))}
        </div>

        {step === 1 ? (
          <div className="grid gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                What&apos;s happening?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Describe the issue in plain language. Example: &quot;The sink is
                draining slowly&quot; or &quot;The furnace is making a loud noise.&quot;
              </p>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="issue-title">Short title</Label>
                <Input
                  id="issue-title"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Slow kitchen drain"
                  value={draft.title}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issue-description">Description</Label>
                <Textarea
                  id="issue-description"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="What changed, when it started, and anything you noticed."
                  rows={4}
                  value={draft.description}
                />
              </div>
            </div>
            <Button
              className="w-fit"
              disabled={!canContinueFromIntro}
              onClick={() => setStep(2)}
              type="button"
            >
              Continue
            </Button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                What area does this relate to?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose the part of the place and where it is happening.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="issue-category">Category</Label>
                <select
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  id="issue-category"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  value={draft.category}
                >
                  {issueCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issue-location">Location</Label>
                <select
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  id="issue-location"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                  value={draft.location}
                >
                  {issueLocations.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="issue-context">Living situation</Label>
                <select
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  id="issue-context"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      renterOwnerContext: event.target.value,
                    }))
                  }
                  value={draft.renterOwnerContext}
                >
                  <option value="both">Not sure / shared household</option>
                  <option value="renter">I rent</option>
                  <option value="owner">I own</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStep(3)} type="button">
                Continue
              </Button>
              <SecondaryCTA onClick={() => setStep(1)} type="button">
                Back
              </SecondaryCTA>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                How urgent is it?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick the closest level. Urgent issues show extra escalation
                guidance.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {issueUrgencies.map((urgency) => (
                <button
                  className={cn(
                    "rounded-2xl border p-3 text-left transition-colors",
                    draft.urgency === urgency.value
                      ? "border-primary/30 bg-primary/10"
                      : "bg-card hover:bg-muted/30"
                  )}
                  key={urgency.value}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      urgency: urgency.value,
                    }))
                  }
                  type="button"
                >
                  <p className="font-semibold">{urgency.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {urgency.description}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStep(4)} type="button">
                Get next steps
              </Button>
              <SecondaryCTA onClick={() => setStep(2)} type="button">
                Back
              </SecondaryCTA>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Here&apos;s a safe way to handle this
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nestify is organizing the issue and suggesting safe next
                  steps, not making a certain diagnosis.
                </p>
              </div>
              <StatusBadge value={urgencyLabel(draft.urgency)} />
            </div>

            {urgent ? (
              <div className="flex gap-3 rounded-2xl border border-[color:var(--warning)]/25 bg-[color:var(--warning-bg)] p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color:var(--warning)]" />
                <p>
                  This may need urgent attention. If there is immediate danger,
                  leave the area and contact emergency services or the
                  appropriate professional.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-sm font-semibold">Summary</p>
                <h3 className="mt-2 text-lg font-semibold">{draft.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {categoryLabel(draft.category)} · {draft.location} ·{" "}
                  {urgencyLabel(draft.urgency)}
                </p>
                <p className="mt-3 text-sm">{draft.description}</p>
              </div>
              <div className="grid gap-3">
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-sm font-semibold">Possible causes</p>
                  <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
                    {guidance.likelyCauses.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-sm font-semibold">Safe first steps</p>
                  <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
                    {guidance.recommendedSteps.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-sm font-semibold">What not to do</p>
                <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
                  {guidance.safetyNotes.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-sm font-semibold">When to call someone</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {guidance.escalation}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Track it in Nestify</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Save this issue, turn it into a Care follow-up, or mark it
                    resolved if you already handled it.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={createIssueFollowUpTask}>
                    <HiddenIssueFields draft={draft} />
                    <SubmitButton
                      label="Create follow-up task"
                      pendingLabel="Creating task..."
                    >
                      <Wrench className="size-4" />
                    </SubmitButton>
                  </form>
                  <form action={createRepairIssue}>
                    <HiddenIssueFields draft={draft} />
                    <SubmitButton
                      label="Save issue"
                      pendingLabel="Saving..."
                      variant="outline"
                    />
                  </form>
                  <form action={createRepairIssue}>
                    <HiddenIssueFields draft={draft} status="resolved" />
                    <SubmitButton
                      label="Mark resolved"
                      pendingLabel="Saving..."
                      variant="ghost"
                    >
                      <CheckCircle2 className="size-4" />
                    </SubmitButton>
                  </form>
                  <SecondaryCTA asChild>
                    <Link href="/app/maintenance">Open Care</Link>
                  </SecondaryCTA>
                </div>
              </div>
            </div>

            <SecondaryCTA className="w-fit" onClick={() => setStep(3)} type="button">
              <ArrowLeft className="size-4" />
              Back
            </SecondaryCTA>
          </div>
        ) : null}
      </CardContent>
    </ProductCard>
  );
}
