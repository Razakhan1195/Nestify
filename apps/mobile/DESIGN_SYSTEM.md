# Rezlee Mobile Product & Design System

Rezlee should feel like one calm, considered consumer product — not a collection of feature cards.

## Product hierarchy

Every screen has one primary job. Before adding UI, answer:
1. Why did the person come here?
2. What should they understand in five seconds?
3. What is the most likely next action?
4. What happens after that action?
5. How do they find, change, pause, undo, or revisit it later?

A feature is not complete until its full lifecycle works.

## Home

Home is not an app launcher. The navigation already provides that.

Home may show:
- current household state
- genuine attention requiring action
- things due today
- one useful household-cost summary
- upcoming dated events

Do not add generic feature/value cards once a user is active.
## Cards and surfaces

Use a contained card only when the content benefits from being understood as one object:
- primary exception/action
- chart or analytics module
- form grouping
- selected object/details
- meaningful empty state

Do not put every section or row inside a rounded rectangle.

Lists, timelines, navigation rows and editorial insights should normally use spacing, typography and separators.

Never show a chevron, arrow or pressed state unless tapping it does something useful.

## Information hierarchy

Prefer:
- typography
- whitespace
- ordering
- restrained iconography
- one accent surface

before adding borders, shadows, badges or nested tiles.

One screen should not have multiple elements competing as the hero.

Avoid duplicate labels such as "Focus now / Needs action" or "Today / Today at home."

## Interaction

Minimum touch target: 44pt.
Use light haptics for deliberate completion/navigation where helpful.
Primary actions should be obvious without scrolling whenever practical.
After a mutation, show a visible result:
- what happened
- where the created/changed thing now lives
- what happens next

No dead buttons, placeholder destinations, decorative controls, or generic fallback navigation.

## States

Every major feature needs:
- loading
- empty
- active
- attention/error
- success/confirmation
- historical/manage state

Empty states should explain the first useful action, not market every feature.

## Intelligence and AI

AI is a capability, not decoration.

Do not label ordinary deterministic facts as AI insights.
Do not repeat information already obvious elsewhere on the same screen.

Rezlee intelligence should surface non-obvious, grounded observations or reduce work:
- anomaly detection
- extraction/scanning
- contextual explanation
- recommendations based on household data
- cross-domain reasoning

If confidence or data is insufficient, show less rather than inventing an insight.

## Visual system

Use values from theme/tokens.ts before introducing new sizes/colors/radii.
Primary palette: quiet sage, cream and restrained semantic colors.
Prefer Feather icons already used across the app.
Use one icon family and consistent visual weight.
Use illustrations sparingly for onboarding, empty states and moments where they add comprehension.

Avoid:
- generic SaaS dashboards
- grids of unrelated KPI tiles
- excessive shadows
- gradients without meaning
- nested cards
- tiny labels everywhere
- decorative analytics
- permanent marketing copy inside active workflows

## Feature completion checklist

Before calling a feature complete:
- Discover: can the user find it naturally?
- Value: is it clear why it matters?
- Start: is beginning low-friction?
- Complete: can the main job be finished?
- Confirm: is the outcome obvious?
- Return: can the user find it again?
- Manage: edit/pause/delete/change ownership where relevant
- Remind: appropriate notifications/reminders where relevant
- History: useful context when history exists
- Recover: errors and retries are clear
- Privacy: shared vs private data is explicit
- Accessibility: labels, touch targets and contrast are appropriate

## Build rule

When a new feature conflicts with this system, change the feature — not the system casually.
If a new pattern is genuinely better, update this document and reusable primitives so the whole product can inherit it.

## First-use Home (2026-09-24)

All remaining first-use tasks are visible at once: a wider Bills tile, coordinated Records/Care tiles, and a smaller permanent Ask Rezlee tile underneath. No carousel, automatic rotation or starting-task preference control. Retire each setup tile only from actual saved data; completing Care must not undo setup. Unknown reads are not empty. A saved bill must not hide the Records/Care actions. After saving, show real saved information above the remaining actions; all setup tiles disappear only when all three categories have saved data. Further creation stays in Add and the tabs. Ask Rezlee serves ongoing help and never counts as a setup milestone. Avoid a duplicate Home header AI control; retain it elsewhere. Stack compact columns for narrow screens/large text, use original HomeTaskArtwork and keep interactions direct. See docs/home-action-tiles-2026-09-24.md for current behavior and verification.


## Approved Home composition — 2026-09-25
This replaces the 2026-09-24 Home placement rules above. Home now prioritizes cross-household actions, at most two supported account-specific bill findings, relevant records and direct capture. Full account history belongs in Bills. Ask Rezlee is accessible in every tab header; the explanatory AI tile is for empty households. Initial task tiles use full-width, explicitly illustrative Canadian document artwork. Established households retain quieter task entry points. Account counts require sufficiently known identity and coverage; unmatched uploaded/connected histories are not silently merged. See the checkpoint and home-overview/bill-account-overview rules and tests.


## Header and capture refinement — 2026-09-25
Home uses a circular account/profile affordance, a name greeting when known and a labelled unboxed Ask Rezlee action. Household context is a quiet home/name disclosure with a right chevron. Direct capture uses distinct icons and subtle semantic surfaces, not repeated outlined pills. At narrow widths/large text, header actions and capture layout reflow. Preserve all existing empty/partial/multi-account content and paths.

## Account navigation — 2026-09-25
More is no longer a primary tab. Home profile opens the authenticated /account stack screen with standard back navigation. Household context and Ask remain separate. Legacy More links redirect for compatibility; member tab permissions are preserved.


## Header, colour and collection controls — 2026-09-25 afternoon
Supersedes previous Home header placement rules. Keep the warm cream canvas. Use the existing pale sage surface only for Home's grouped profile/greeting/household header; no decorative whole-screen gradient or extra metrics. Home renders TabHeader itself using its existing household payload; the navigator header is hidden only for Home. No additional household request. Remove the standalone date. Ask remains a labelled unboxed action; narrow screens/large text retain reflow. Household disclosure remains an explicit labelled tap target.

Bills and Vault use CollectionToolbar's same compact forest-green Add control. CollectionAddSheet supplies explicit action choices, a dismissible backdrop, Close, Android-back handling, a scrollable height-bound sheet and accessible labels. Existing creation destinations remain intact. Keep Home direct capture shortcuts.

Bills view switching uses SegmentedControl: neutral track, raised selected segment, tab semantics, stacked options at large text. FilterChips remain horizontally scrollable pills with quiet selected tint and outline. Primary creation, view switching and filtering must not use indistinguishable treatments. Screen section gaps and top inset use shared layout tokens. Other FilterChips consumers inherit the same selection styling.

Review criteria: no duplicate Home header/date; household/profile/Ask remain discoverable and separate; long household names wrap; each Add choice opens its original flow; sheet dismissal preserves underlying screen; Bills view selection and legacy history links resolve correctly; zero/one/multiple-account and partial-data logic unchanged. Dark mode remains deferred until a proper theme/contrast pass.


## Statement upload review — 2026-09-25
An upload is a reading-and-review flow, not a blank entry form. Clearly disclose document processing before selection. Show honest unread/reading/review/partial/failure states. Prefill supported fields; show a compact summary with explicit correction and one confirm/save action. Ask only for unclear required details. Manual entry is an explicit fallback, never a silent substitution for unavailable reading. Unknown service capability is not success. Keep drafts and recovery actions available; never guess money, dates, currency or account identity.


### Statement review (2026-09-25)
Keep the batch list and the selected statement review separate. A populated review prioritizes provider/account, period charges, service dates and one Save statement action. Full fields belong behind Edit details; unresolved extracted fields appear inline. File management and detailed extraction evidence belong in Options. Preserve pending edits before returning to the list. Never equate an issued advance bill with an invalid period, or unknown currency with an unread amount. Future service dates are acceptable on an already-issued statement; no payment or consumption-completion claim follows from saving.


## 2026-09-25 — current tab and evidence hierarchy (supersedes sage Home header)

- All main tabs share the compact neutral profile/Ask Rezlee navigation bar. Greetings and collection titles are part of scrolling content, not a coloured fixed band.
- Use CollectionToolbar + CollectionAddSheet for collection creation; Button for the empty-state primary action. Use NavigationButton for custom back/close controls, retaining each route's exit semantics.
- Hide empty collection search/filter controls until they are useful. Keep unfinished work recovery visible.
- A saved statement alone is not an insight. Use compact account rows; promote only supported comparisons. Never give ordinary records warning colour or imply a monthly household total across different periods.
- Colour remains in useful artwork and selected content surfaces. No global dark-mode addition in this increment.
- No unsupported overpayment warning or automatic provider enquiry. Preserve saved actions; expose their editor only when one exists.
- Resulting rendered phone verification is pending; see docs/tab-hierarchy-audit-2026-09-25.md.


## 2026-09-25 evening — grouped surfaces, not floating Home rows

Current direction after founder feedback: main tabs use the shared warm stone canvas (#F0F0E9). It continues through the compact tab header and bottom bar without a separate coloured header band. Keep detail/form backgrounds unchanged.

Home's greeting and capture shortcuts form one spatial group. Household information is grouped by purpose in HomeSection: a restrained sage-grey bill surface (#E5ECE8), and warm off-white surfaces for upcoming items, attention and recent records/activity. One section can contain several rows; do not give every bill its own card. Retain each account's amount/period, existing account grouping and all-account access. At larger text/small widths the bill amount moves below its provider. A calm no-upcoming message is quiet status, not a large headline.

Bills and Vault use the same SegmentedControl for their top-level views and CollectionSearch for search. Category/status FilterChips remain subordinate filters rather than top-level navigation. Retain empty-state suppression and existing creation/resume paths.

ScreenNavigation now handles Bill Details, Add Bill and single statement upload as well as Vault records/batches. Add Bill keeps a Close at the chooser and Back within methods; busy guards and unsaved-work behaviour remain. Receipt batch and Vault save recovery exclude the duplicated top safe-area inset. NavigationButton remains the shared back/close affordance.

This is implemented and statically verified; resulting physical-device render and interactions remain unverified (native runtime not connected). No dark-mode addition or business-rule change.


## 2026-09-26 — Approved coherent journey rules (supersedes grouped bill tile / segmented banner)
- Home setup is per capability. Saving a bill does not adopt Vault merely because its original is stored there.
- Distinct account cards use a shared structure, provider identity, white surface, subtle border, separate period and amount. Never merge account amounts into an implied monthly total.
- View navigation uses quiet text, a selected underline and subtle separators; category filters and Add remain distinct.
- Setup art is compact beside text at ordinary sizes and stacks at larger text sizes. Preserve bundled Canadian examples without implying connected accounts.
- Care adoption is based on successful server persistence, separately for reminders, cleaning and maintenance. Failed reads are unknown. Active work precedes remaining setup opportunities.
- Recall Watch belongs with home items. Only actionable potential matches enter Home.
- Account overview precedes investigation; no unsupported overpayment or generic provider draft.
- Implementation verified by code/build/hosted checks. Physical render comparison still required; do not claim design QA from bundle success.


## 2026-09-26 — Video-led collection navigation (supersedes separators above)
Use two plain-text destinations on Bills and Vault, with a single travelling underline and horizontal swipe paging. No vertical tab dividers or individual tab outlines. Bills: Accounts / All bills. Vault: Records / Home items. Status, category and warranty coverage belong in compact filter sheets, not additional top-level tabs. Preserve legacy links and all saved records. Honour Reduce Motion, selected tab accessibility, large text and offscreen panel isolation. Physical-device verification pending.


## 2026-09-26 — Approved task-based three-view navigation (supersedes two-view rule)
Bills uses Insights / Accounts / History, defaulting to Insights. Insights explains a selected account; Accounts manages accounts; History finds every saved bill with subordinate filters. Keep the same order in empty and populated states. Vault uses Records / Home items / Warranties; Warranties combines warranty documents and recorded item coverage without duplicating stored records. Search is scoped independently to each Vault view. These are distinct customer tasks, not arbitrary category additions.

Retain plain text tabs, a single travelling underline and horizontal swipe. No outlined tab banner or vertical dividers. Keep Add and category/status filters distinct. Explicitly label account scope; never pool unrelated amounts. If a selected account is unavailable, ask for selection rather than silently changing context. Supported findings and recorded trends earn prominence; an ordinary bill is not an overpayment warning. Preserve Reduce Motion and accessibility semantics. Physical-device visual/touch verification remains pending; see docs/bills-vault-three-view-2026-09-26.md.


## 2026-09-26 — Personal identity and account hierarchy
Profile (/account) is the personal overview; Settings (/account-settings) holds configuration. Use the persisted personal initials badge consistently in the profile and tab navigation, with curated accessible colours. Household is people and shared responsibilities; household-name editing is distinct from personal-badge editing. Security shows actual email/device state, never decorative certifications or nonfunctional controls. Group related rows on restrained surfaces and use the shared ScreenNavigation header. Completed Care links to evidence; no all-time score or savings claim is inferred from a current task count. Preserve private Bills/Vault boundaries. Physical rendering verification remains pending.


## 2026-09-26 — Saved-bill identity refinement
Home bill accounts retain individual statement surfaces, with a subtle service-colour header and neutral amount/period body. Use bundled issuer marks only for explicit known aliases, preserving original logo colours; unknown providers use a service icon plus full name, never arbitrary initials. Preserve account context, period boundaries, missing amounts and draft/older-record labels. No decorative graph without valid account-specific history. Native visual verification remains required.


### 2026-09-26 — Clean Home bill tiles (supersedes saved-bill header treatment)

Home bill accounts use one continuous raised surface without a coloured header band or footer divider. A recognised provider's wordmark is its sole visible name; an unknown provider or failed logo renders a service icon and full provider name. Keep the amount, its meaning, service period and quiet account context. Omit generic extraction categories such as multiple/unknown. Use a single chevron for the whole-card account destination. No saved-record count or repeated View details action. Retain currency, credits, draft/stale state, actual supported insight titles, accessible provider identity and unrestricted text wrapping. Keep account grouping and destination logic unchanged.


### 2026-09-26 — Home bill summary composition (supersedes vertically stacked tile)

Use a compact account summary: identity and account context on the left, amount and amount meaning/currency on the right, period beneath with a single chevron. Card inset 16, group gap 12, identity/context gap 4, amount/label gap 2, radius 16. Wordmarks have a 92 by 28 viewport; names use body-semibold. Amount uses title rather than heading scale. White surface blends with bundled opaque wordmarks against the existing warm canvas. No fixed card height: long names and context wrap naturally; at fontScale above 1.2 or viewport below 360, switch to stacked order. Plain Home section heading has no unused 44-point action row. Keep warnings, draft/old-state labels and coverage truth. Changes apply only to Home saved-bill summaries; account destinations, insights and other tab components remain preserved.


## Bills information architecture — approved 2026-09-27
Use three visible peer views: Insights, Accounts, Shared. History is the prominent All statements entry at the top of Accounts, with existing search and filters retained; per-account history remains. Shared owns its Add expense action and reuses ledger states. Do not restore four crowded tabs or hide navigation behind horizontal scrolling. This supersedes earlier Bills navigation descriptions. No new global styling or Vault changes are included in this increment.


## Energy account insights (2026-09-27)
Share the same manual energy account story across Bills Insights and account detail: This bill, History, What changed. Disclose breakdown and exact chart values on demand. One evidence-supported next step, no invented issue or generic provider enquiry. Daily charts show saved periods, not implied continuous monthly totals. Keep missing/estimated data explicit and original/correction routes accessible. Connected Elexicon retains dedicated usage and tariff views.

## 2026-09-30 — Home spacing and expense entry correction
Home card surfaces use homeTile: 20 pt padding/radius, 12 pt inner/group gaps. Setup illustrations retain a 168 pt minimum with natural growth; compact bill summaries need not match setup-tile height. This supersedes the earlier Home bill-card 16 pt padding/radius note only. Preserve the approved four quick actions and artwork. CollectionPages keeps active content in natural layout, inactive panels mounted, underline/swipe and reduced-motion behavior. Expense entry keeps people, payer, amount and shares in one main form; sheets handle selection, and invitations are optional after save. Native visual acceptance remains pending; see docs/ux-beta-handoff-2026-09-30.md.

## 2026-09-30 — Capability tile composition supersedes independent layouts
Home setup/opportunity cards use HomeFeatureTile, not separate oversized hero/header compositions: full-width section title (17/22), meta detail/action (13/18), 108x72 art area, 20 pt inset/radius, 12 pt gaps, one consistent right-arrow action. Content grows for larger text; no line clamping or fixed card height. Group adjacent Shared expenses/Vault/Care setup tiles at 12 pt spacing. Bill summaries and returning shared balances still reflect their own information needs. Insights uses InsightAccountPicker for account identity/selection; CollectionFilter remains for category/status filters. Native visual acceptance is pending.
