# Dwellwise Product & Engineering Instructions

You are building Dwellwise, a mobile-friendly web app for homeowners.

Dwellwise is not a generic home management app, not a budgeting app, and not a random AI assistant.

Dwellwise is the home command center that helps homeowners know what changed, what is due, what needs attention, and where important home records live.

## Core product promise

Know what your home costs, what changed, what is due, what needs attention, and what to do next.

## Customer-facing value proposition

Dwellwise keeps your home organized by bringing bills, due dates, provider records, documents, maintenance, inventory, projects, and home history into one calm monthly dashboard.

## Primary MVP wedge

Deck-powered provider and bill automation.

The app should help users connect home providers, retrieve bill data, detect changes, store bill PDFs, and generate a monthly home operating report.

## What the app should feel like

* A monthly operating report for your home
* A trusted home memory
* A calm assistant that catches changes and reminds you what matters
* A place homeowners can return to when they need proof, records, due dates, or next steps
* One coherent home command center, not a collection of disconnected tools

## What the app should not feel like

* A spreadsheet
* A generic bill tracker
* A budgeting app
* A contractor marketplace
* A random AI chatbot
* A manual home inventory chore
* A collection of disconnected pages

## Core product loop

Set up home → connect providers → understand monthly status → store proof and records → know what to do next → build home history over time.

## Primary release surfaces

The main app navigation should focus on:

* Dashboard
* Providers
* Bills
* Vault
* Maintenance
* Home

## Contextual/supporting surfaces

Do not delete supporting features unless explicitly instructed.

Instead, integrate them into the customer journey:

* Inventory belongs inside Vault or Home.
* Projects belongs inside Maintenance or Vault.
* Timeline belongs inside Home or Dashboard.
* Assistant should appear as a contextual action such as “Ask Dwellwise,” not as the main product experience.

The goal is not a tiny MVP. The goal is a focused, release-quality MVP.

## Product questions every core feature must answer

Every core feature should help answer at least one of these:

* What changed?
* What is due?
* What looks unusual?
* What needs attention?
* What should I do next?
* Where is the record/proof?

## Dashboard principles

The dashboard is the product.

It should not be a generic set of cards. It should feel like a monthly operating report for the home.

The dashboard should prioritize:

1. Needs attention
2. What changed
3. Coming up
4. Known home costs
5. Provider health
6. Recent home records
7. Maintenance due
8. Project or repair follow-ups where relevant
9. Home history/timeline where relevant

The dashboard should use plain-English explanations.

Good:
“Your Rogers Internet bill increased by $12 compared with last month.”

Bad:
“Amount delta exceeded threshold.”

## Provider setup principles

Provider setup should feel like:
“Connect these providers to unlock your home dashboard.”

It should not feel like a technical integration page.

The app must separate:

* Provider category: Electricity, Gas, Water, Internet, Property Tax, Insurance
* Actual provider name: Hydro One, Enbridge, Rogers, Town of Whitby, TD Insurance

Provider setup should explain what each connection unlocks:

* Bill amount
* Due date
* PDF
* Usage where available
* Bill changes
* Provider history
* Monthly home summary

## Deck integration principles

* Keep Deck behind an adapter layer.
* The app must work in DECK_MOCK_MODE=true.
* Do not spread Deck-specific logic across pages.
* Do not store provider passwords in Dwellwise.
* Prefer Deck-hosted or tokenized provider auth.
* If credentials must pass through Dwellwise during development, label it clearly as development/pilot only and never log credentials.
* Store only Deck connection IDs, credential IDs, task run IDs, and safe metadata.

## Trust and privacy principles

* Never expose service role keys to the client.
* Never log passwords or provider credentials.
* Use Supabase RLS.
* Validate ownership server-side.
* Use signed URLs for private documents.
* Keep sensitive connection language clear and calm.
* Users should be able to disconnect providers.

## Engineering principles

* Use TypeScript strictly.
* Keep pages small where possible.
* Move data fetching and calculations into lib files.
* Split dashboard into reusable components where practical.
* Keep Supabase RLS intact.
* Validate ownership server-side.
* Keep UI calm, premium, mobile-first, and clear.
* Do not add major new product areas without explicit instruction.

## Current priority

Before adding more features, improve the customer experience, dashboard information architecture, navigation hierarchy, provider setup clarity, and product positioning.
