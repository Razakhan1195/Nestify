# Rezlee Product & Engineering Instructions

Rezlee keeps the everyday admin of where you live together and shows what needs attention next. The product serves renters, owners, couples, families, and roommates. It does not yet implement shared household access.

## Product promise

Your place, under control. Know what is due and changing. Keep important records. Care for your place. Understand issues and household history. AI supports these outcomes; it is not the product category. Provider connections are optional automation. A first session should deliver value from one bill, record, reminder, or issue.

## Preserve existing capabilities

Read docs/rezlee-preservation-map.md before changing workflows. Preserve all existing routes, server actions, data and discoverability, including Repairs, Projects, Inventory, Appliances, Warranties, Timeline, Attention and Assistant chat/history. Older docs describe earlier iterations and must not override the current implementation or this direction. Do not replace functionality with mocks, dead controls or coming-soon UI.

## Experience

Use calm, concrete, ownership-neutral language. Dashboard states EMPTY, EARLY, ACTIVE, ATTENTION and STABLE must remain distinct. One state-driven primary action; no repeated setup prompts. History is not an alert. Handled items are not active warnings. Bills, Vault, Care, Help, Providers and Place form the primary journey. Supporting features must remain easy to reach on mobile and desktop.

## Engineering and safety

Use strict TypeScript. Keep Supabase RLS and server-side ownership checks intact. Never drop or rename persisted structures for branding. Keep historical migrations immutable; use additive compatible migrations only. Keep Deck behind its adapter and preserve mock mode. Never log/store provider passwords or expose service keys. Use authenticated, short-lived signed URLs for private documents. Fail closed for privileged endpoints. Preserve AI usage controls. Validate input and show useful errors without exposing credentials, SQL or developer setup instructions.

## Launch verification

Run lint, typecheck, build and regression tests. Inspect desktop/mobile browser layouts and critical workflows when credentials are available. Report unavailable checks honestly. Do not claim live RLS, email, OAuth, provider or AI validation without actually testing them. No invented testimonials, security certifications, pricing or legal protections. Do not deploy or merge automatically without explicit authorization.
