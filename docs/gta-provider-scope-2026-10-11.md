# GTA provider scope and Green Button routing — 2026-10-11

## Decision and result

Founder approved GTA-first discovery and exclusion of utilities already integrated through Green Button. This supersedes the earlier 52-hosted-entry staging catalogue as a launch-scope claim. Catalogue inclusion is a configured candidate, not provider-specific launch acceptance.

- 30 Deck online connection candidates for the GTA cohort.
- 10 upload alternatives, including six hydro companies that also issue water bills.
- 11 Green Button overlaps excluded from new Deck sign-ups.
- 11 regional entries deferred from new discovery.
- Existing connections retain management/reconnection metadata; saved bills, credentials and integration rows were not migrated or deleted.
- All 25 GTA municipalities still have a catalogue water route through a standalone water provider or document upload. This does not certify successful bill retrieval for every provider.

## Green Button boundary

Compared against the actual EZGB utility selector for the configured customer code on October 11: https://button.screamingpower.ca/guest/selectUtility/a6nyja. The retrieved public selector is retained in the checkpoint. Presence in that selector establishes routing coverage, not full customer lifecycle acceptance. Water documents are not claimed to arrive through Green Button.

| Provider | New connection route |
|---|---|
| Alectra Utilities | Green Button for energy; water statement upload |
| Elexicon Energy | Green Button for energy |
| Enbridge Gas | Green Button for energy |
| EPCOR | Green Button for energy |
| Hydro One | Green Button for energy |
| Toronto Hydro | Green Button for energy |
| Burlington Hydro | Green Button for energy; water statement upload |
| Halton Hills Hydro | Green Button for energy; water statement upload |
| Milton Hydro | Green Button for energy; water statement upload |
| Oakville Hydro | Green Button for energy; water statement upload |
| NT Power | Green Button for energy; water statement upload |

## Remaining Deck candidates

These 30 retain their configured hosted flows; individual provider acceptance still applies.

- **Home Insurance:** Aviva, Intact, Sonnet, Square One, TD Insurance, The Co-operators.
- **Internet:** Bell, Cogeco, Rogers, TekSavvy, Telus.
- **Other Home Services:** a.p.i. ALARM, Enercare, GFL Environmental, Reliance Home Comfort, Telus SmartHome Security, Waste Connections.
- **Property Tax:** City of Mississauga Property Tax, City of Toronto Property Tax.
- **Water:** City of Toronto Water, Region of Durham Water, Region of Peel Water, Richmond Hill Water, East Gwillimbury Water, Georgina Water, Stouffville Water.
- **Mobile:** Fido, Freedom Mobile, Koodo, Virgin Plus.

## Document alternatives

Upload routes: Water via Alectra Utilities, Town of Pickering Property Tax, Town of Whitby Property Tax, Water via Burlington Hydro, Water via Halton Hills Hydro, Water via Milton Hydro, Water via Oakville Hydro, Water via NT Power, Aurora Water, King Township Water.

Deferred from new Deck discovery: ATCO, BC Hydro, Énergir, ENMAX, FortisBC, Hydro-Québec, Manitoba Hydro, SaskEnergy, SaskPower, Shaw / Rogers, Videotron.

## Implementation and verification

The policy is enforced in catalogue discovery, hosted sign-in, the legacy connection endpoint and shared provider configuration. Unknown/new out-of-scope IDs fail closed. Existing connection ownership and admission checks remain. The native picker routes energy to Green Button, labels water uploads, hides existing-only entries from new discovery and removes unselected login fields. Provisioning skips overlapping/out-of-scope entries; provisioning was not run.

- 84 provider regression tests passed.
- 12 actual-component React Native Web screen/interaction scenarios passed at 320 and 390 px; water and existing-connection screenshots visually inspected.
- 39 hosted staging assertions passed: catalogue counts, all 25 water routes, blocked energy/regional starts, no hosted intents created by blocked attempts, existing connection metadata/detail access and unauthorized reads. Synthetic user removed.
- Root/mobile TypeScript, scoped lint and hosted Next build passed.
- Full suite: 840/841 passed. The pre-existing statement-reading-activation test still fails; no all-green claim.
- No paid provider retrievals, AI calls, emails, scheduled updates or customer-data changes.

## Deployment and limits

Staging: https://nestify-nypkdvxtq-razakhan1195s-projects.vercel.app; staging.rezlee.com alias applied and verified. Backend was built from the previous deployed snapshot with only the six backend policy files overlaid; prior versions matched recorded pre-change hashes. Mobile development source is updated; TestFlight and production are unchanged. No physical iOS/Android acceptance occurred.

Previous staging for rollback: https://nestify-h11icx3qq-razakhan1195s-projects.vercel.app. Restore changed local files selectively from before.zip, remove only files recorded as previously absent, and preserve unrelated working-tree changes. Before/after hashes, full source archives, scoped diff, build log, tests, screenshots and reproducible check scripts are in docs/checkpoints/gta-provider-scope-20261011.

This closes the catalogue-selection correction. Utility lifecycle, provider-specific retrieval/MFA/reconnection acceptance, bill usefulness/outcomes and wider release gates remain on the roadmap.
