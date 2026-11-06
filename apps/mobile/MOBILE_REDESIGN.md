# Rezlee Mobile Redesign

## Product principle
Rezlee mobile should feel like a calm control surface for a place, not a compressed web dashboard.

Every primary screen has one job:
- Home: what needs attention now
- Bills: understand and handle household costs
- Care: stay ahead of maintenance and issues
- Vault: find and save proof, records and warranties
- More: account, place settings and secondary tools

## Interaction principles
1. One screen, one job. Do not repeat domain metrics across tabs.
2. Attention beats analytics. Surface action before counts and charts.
3. Progressive detail. Summary first, detail after a tap.
4. Calm by default. Empty and stable states should feel successful, not blank.
5. Renter and owner neutral. Use “place”, “home” and “household” carefully.
6. AI is supportive, not the product chrome. It appears when it can resolve a task.
7. Native first. Prefer sheets, lists, haptics and direct manipulation over web patterns.

## Visual system
- Palette: existing Rezlee cream + sage system
- Screen horizontal padding: 20
- Primary surface radius: 20
- Minimum touch target: 44
- Section spacing: 28
- Display title: 32 / semibold
- Body: 15 / 22
- Meta: 13 / 18

## Screen roadmap

### Home — implemented first
- Place/status header with a single Add affordance
- Vertical attention stack, maximum three items before deeper navigation
- Calm “all caught up” state when nothing needs action
- Compact “Next up” preview
- Remove quick-action grid, monthly overview tiles and recent activity from Home

### Bills — next
- Keep list as the core job
- Replace dashboard-style header with a compact monthly summary
- Make overdue/due-soon hierarchy more visual
- Add native create/edit flow and payment handling
- Preserve filters, but reduce chip weight and scrolling friction

### Care
- Replace placeholder with Today / Upcoming / History views
- Task and repair cards with clear due state
- Fast complete, snooze and provider actions
- Add issue flow with photos and notes

### Vault
- Search-first structure
- Recent records plus simple categories: documents, warranties, appliances
- Camera/file import as the primary add flow
- Surface warranty expiry or missing-proof attention back on Home

### More
- Account and place profile
- Household members and providers
- Notifications, connections and help
- Keep experimental/AI tools secondary until they solve a clear job

### Auth and onboarding
- Keep authentication visually minimal
- Move native place setup into mobile so web is no longer required
- Ask only for information needed to produce useful first-day attention

## Build order
1. Home visual system and attention model
2. Native Add sheet and create flows
3. Bills redesign + create/edit
4. Care end-to-end
5. Vault end-to-end
6. Native onboarding
7. More/settings and assistant entry points

## Design-system code
Shared tokens live in `src/theme/tokens.ts`.
Reusable surfaces and section headers live in `src/components/ui`.
New screens should use those primitives instead of defining new colors, radii or spacing ad hoc.
