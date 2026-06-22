# Guided Help QA

## Scope

Guided Help is currently rules-based guided issue help, not AI-powered diagnosis. It does not call an AI API and does not claim certainty. The flow is designed to help a user organize a household issue, review safe next steps, and create a Care follow-up.

## What Was Reviewed

- Help page route: `/app/help`
- Legacy assistant redirect: `/app/assistant`
- Guided issue intake component
- Rules-based issue guidance
- Issue save action
- Care task creation from a saved or unsaved issue
- Issue resolution and note actions
- Care page task display
- Dashboard Things to Handle integration
- Recent Activity event filtering
- Guided issue migration
- Toast and error copy

## What Passed

- Help page is a structured issue flow, not a generic chat screen.
- The intake flow has four steps: description, category/location, urgency, and result.
- Result step shows summary, possible causes, safe first steps, safety notes, escalation guidance, and tracking actions.
- Urgent/electrical/leak/safety cases show escalation language.
- Guidance is rules-based and avoids fake diagnosis or dangerous repair instructions.
- Saved issues are scoped by `user_id` and `home_id`.
- Issue follow-up tasks are created in Care with urgency-based due dates.
- High/urgent unresolved issues can appear in Dashboard Things to Handle.
- Issues with linked Care tasks are not duplicated as issue attention items.
- Resolved issues leave the open list and are available in the resolved section.
- Success toasts use short copy and auto-dismiss through the existing toast component.

## Fixes Made During QA

- Added server-side duplicate protection so an existing issue cannot create multiple Care tasks after it already has `related_task_id`.
- Changed issue resolution toast copy to `Issue resolved.`
- Added `Open Care` to the result actions.
- Updated Help empty states to distinguish no open issues from no resolved issues.
- Hid raw database errors from the Help page and replaced them with user-safe messages.
- Added issue follow-up context to Care task rows.
- Aligned dashboard task action copy with Care by using `Complete`.
- Kept old `/app/assistant` route as a redirect to `/app/help`.

## Manual QA Scenarios

These scenarios still need to be run against a logged-in browser session after the migration is applied.

### Scenario A: Medium Plumbing Issue

Input:
- Title: Bathroom sink drains slowly
- Description: Water takes a long time to drain.
- Category: Plumbing
- Location: Bathroom
- Urgency: Medium

Expected:
- Possible causes mention clog, buildup, and blocked trap.
- Safe first steps avoid harsh chemicals and suggest checking other drains.
- Save issue works.
- Create Care task works.
- Task appears in Care with a due date this week.
- Dashboard does not over-prioritize it unless the task due date is relevant.

### Scenario B: Urgent Electrical Issue

Input:
- Title: Burning smell near outlet
- Description: There is a burning smell near the outlet.
- Category: Electrical
- Location: Kitchen
- Urgency: Urgent

Expected:
- Safety panel appears.
- Copy says not to open panels or attempt live electrical work.
- Escalation language appears.
- Saved issue appears in open issues.
- Dashboard may show it in Things to Handle.

### Scenario C: Renter Leak Issue

Input:
- Title: Leak under sink
- Description: Water is dripping under the kitchen sink.
- Category: Leak / water damage
- Location: Kitchen
- Urgency: High
- Living situation: I rent

Expected:
- Water/electrical safety copy appears.
- Renter-friendly landlord/property manager copy appears.
- Create follow-up task works.

### Scenario D: Resolve Issue

Steps:
- Open a saved issue.
- Mark it resolved.

Expected:
- Issue leaves Open issues.
- Issue appears in Recently resolved.
- Dashboard active issue clears.
- Toast says `Issue resolved.`
- Recent Activity records `Issue resolved`.

## Migration Required

Run this in Supabase SQL Editor before testing the full flow:

`supabase/migrations/202606200001_guided_issue_help.sql`

This migration extends the existing `repair_issues` table with structured guidance, issue lifecycle, and Care task linking fields.

## Remaining Limitations

- No photo upload is exposed.
- No AI diagnosis is used.
- The result step supports adding notes after an issue is saved, from the open issue card.
- Automated browser QA was not run because the in-app Browser control tool was not exposed in this session.
