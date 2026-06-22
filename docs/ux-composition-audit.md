# UX Composition Audit

Production composition sprint for Nestify. This file documents repeated UI patterns found across Dashboard, Bills, Vault, and Care, and the ownership rules that should guide future changes.

## Repeated Copy Found

- Dashboard empty state repeated the same starter idea in the hero, starter panel, and the explanatory cards.
- Bills page repeated manual-first language in the header, automation strip, empty state, and add form.
- Vault page repeated “Add document” language in the page header, empty state, record rows, and the add form.
- Care page repeated “Add reminder” across the page header, recommended starter cards, empty state, and add form.
- “Nothing needs attention right now” appeared as a full dashboard section even when the user had little or no operational data.

## Repeated CTAs Found

- Dashboard: `Add bill`, `Add document`, and `Add reminder` appeared in the hero, starter panel, and outcome cards.
- Bills: `Add bill` appeared in the page header, automation strip, empty bill list, and manual bill form.
- Vault: `Add document` appeared in the page header, empty state, recent record rows, and add document form.
- Care: `Add reminder` appeared in the page header, every recommended starter task, empty state, and add reminder form.
- Provider automation appeared as both a primary and secondary action in places where manual setup should be the default.

## Overlapping Section Purpose

- Dashboard hero and starter panel both tried to onboard brand-new users.
- Dashboard “This month” acted like another starter CTA grid when there was no data.
- Dashboard “Things to handle” showed an empty success state even when there were no real actionable items.
- Bills automation strip competed with the page header by repeating `Add bill`.
- Vault recent record rows encouraged adding another file instead of focusing on the existing record.
- Care recommended starters used equal-weight cards and repeated the same action instead of behaving like a compact task chooser.

## Changes Made

- Dashboard state calculation now lives in `src/lib/product/dashboard-state.ts` and returns `EMPTY`, `EARLY`, `ACTIVE`, `ATTENTION`, or `STABLE`.
- Empty dashboard shows only hero, outcome rows, and one subtle automation note.
- Empty dashboard setup choices now live inside the `Start setup` dialog, not as a visible page section.
- Dashboard hero has one primary CTA and no longer lists every starter action.
- “What Nestify helps with” is outcome-only and does not repeat Add bill/document/reminder buttons.
- Things to handle appears only when there are open actionable items.
- What changed appears only when meaningful bill change events exist.
- Bills page keeps `Add bill` in the header and removes competing primary bill CTAs from the automation strip and empty list.
- Vault page keeps `Add document` in the header and removes repeated add actions from record rows.
- Care starter tasks are compact rows; only the first recommended task uses the full `Add reminder` label, while the rest use secondary `Add`.

## Final Section Ownership Rules

- Hero: explain current household state and provide one main outcome action.
- Start setup dialog: help a brand-new user choose one first step. Owns Add bill, Add document, Add reminder, and Connect provider during empty setup.
- Next best action: recommend exactly one next step after the user has some data.
- Things to handle: show open actionable issues only. Hide when there are none.
- This month: summarize actual data across Bills, Vault, and Care. Do not duplicate starter CTAs.
- What changed: show meaningful bill or cost changes only. Hide when there is no real change.
- Coming up: show dated bills, reminders, renewals, and follow-ups only. Hide when empty.
- Recent activity: show meaningful history only. Hide when empty or noisy.
- Automation note: explain provider sync as optional automation. Show once, subtly, and never as the dominant action.

## CTA Governance Rules

- One page-level primary CTA should dominate the screen.
- Do not repeat the same primary CTA in the hero, section cards, empty states, and banners.
- Summary cards should link to the relevant area with subtle language like `View`, `Open`, or `Set up`.
- Provider sync should be secondary unless the user is inside a provider setup context.
- Repeated CTAs are allowed only when far apart, serving different contexts, and clearly helpful.
