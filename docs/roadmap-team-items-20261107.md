# Team roadmap catalogue

The founder requested existing and proposed roadmap items on 7 November 2026. Twelve public team-owned items were added: one In progress, eight Under review and three Shipped. See roadmap-catalog-20261107.json for exact text and stable IDs. No votes were added and no customer suggestions were changed. Payment and card ideas are proposals, not available financial services or committed delivery dates. Production Gmail import remains disabled while verification and launch checks are completed.

Team ideas use the existing nullable owner field. Migration 202611070005 makes them visible and votable while preserving active-account, verified-email, session, moderation and customer-deletion protections. Customer submission RPCs cannot create ownerless entries; direct customer table writes remain denied. Review events record this founder-directed publication without impersonating a customer.

The migration was applied transactionally to staging and production after six database scenario tests passed, including customer isolation, session revocation, deleted-owner hiding, team visibility, vote removal, and rejection of hidden team votes. The mobile API was checked against all twelve exact descriptions/statuses and each status/search filter. No web customer access was restored and no new mobile build is needed.
