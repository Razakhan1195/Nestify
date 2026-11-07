# Customer web platform retired

7 November 2026. Explicit founder direction: customer product access is mobile-only.

The customer website login, signup, password recovery, dashboard and all /app screens now hand off to /open before session refresh or rendering. Saved URLs, encoded paths and already-authenticated browser sessions receive the same treatment. Browser server-action POSTs return 410. Old browser authentication and invitation-acceptance routes cannot create a product session or accept a household invitation.

/roadmap now sends the customer to /open?screen=roadmap. Its only product action opens rezlee://roadmap. The interactive web roadmap was removed. Browser-cookie roadmap reads/writes return 410; the mobile bearer-authenticated API remains available. Marketing links and the 404 page use the mobile handoff. “Continue on the web” was removed.

Public marketing, privacy, terms, contact and account-deletion-request pages remain available. Current mobile confirmation, household invitation, gift and referral handoffs remain available. The separately authorized staff console remains behind its existing allowlist and MFA checks; an authenticated customer was denied access in verification. Legacy web household invitations must be replaced using the current mobile invitation flow.

Validation: 1,469 regression tests passed, scoped lint passed, local Webpack build passed, and the Vercel production build passed. The local Turbopack build could not resolve the external node_modules symlink; production's installed dependencies built successfully. Fifty-one HTTP checks passed on both the protected candidate and live rezlee.com, including actual authenticated browser cookies, legacy auth and POST routes, mobile APIs, public legal/support pages and staff isolation. A 390px browser check found no password form, no horizontal overflow and no runtime errors; its roadmap action was rezlee://roadmap.

Live code: e00bfec48ac4ccb4a8c7e294c23681d0b345aabd.
Deployment: dpl_vhpAAEFEV2exEr5Ddmpa6zMC4KKa.
Previous deployment: dpl_ALQtVnQ8ndnePRtXxM6VP2ASCNaR. Reverting would reopen customer web access and should not be done without an explicit decision.

No mobile source changes, new app build, store submission or email were required. Existing TestFlight build 83 uses the preserved mobile endpoints. Evidence is retained in docs/checkpoints/mobile-only-web-20261107 on the connected Mac; do not publish that private checkpoint.
