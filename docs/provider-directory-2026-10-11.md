# Provider directory and guided connections — 2026-10-11

Implemented in mobile source; staging backend deployed. No production deployment or TestFlight submission.

## Customer journey

One company/municipality search replaces the choice between two provider catalogues. Results identify the bill service, region and current availability. Supported Ontario electricity/gas routes to Green Button with the company name carried into the consent introduction; the customer selects that company in the existing EZGB selector. Water is a separate service and never routes to Green Button. Other configured providers use the existing hosted Deck sign-in, 1–6 month history selection and verification flow. Unavailable entries and unmatched searches offer statement upload. Old /provider/deck entry links route to the unified finder; existing connection management remains accessible.

## Availability

- 722 directory entries across all provinces and territories.
- In Ontario: 54 Green Button energy choices, 29 Deck test choices, 639 Coming soon entries.
- 91 water listings including municipalities outside Ontario; 7 remain open through Deck.
- Rogers sign-in, reconnect, legacy credential submission and refresh are paused. Pending handoffs cancel without new paid runs and retain normal abandoned-credential cleanup. Saved providers and bills remain accessible.
- Directory presence is separate from admission: actual configured source/task, hosted client compatibility, deployment policy and home province still control Deck availability. Production remains fail-closed under the existing allowlist.

Coverage limitation: this is a national directory, not a proven exhaustive inventory of every Canadian municipal biller, submeterer, cooperative, insurer or private home-service company. Energy and telecom coverage was expanded from official lists; smaller local providers and property-tax/home-service coverage remain incomplete. No arbitrary connection is offered when a search misses. The customer UI states that local listings are still growing.

## Hosted Deck configuration

All 29 authentication/history task pairs were present, updated as needed, and read back through Deck. Source/task IDs were preserved. Cogeco, Aviva and Intact now use current direct entry URLs. Waste Connections keeps the portal linked from its own Canadian website: the raw HTTP fetch returned a session error, while the official-link fetch rendered sign-in; this is not evidence of successful authentication. Bell’s previously successful history task was retained unchanged.

Prompts specify the exact portal; verification is requested from the user with no automatic resend/rejected-login retries. Provider-specific notes cover municipal account fields, insurance documents and security billing. Only original issued bills are requested; unavailable documents and incomplete coverage must be reported honestly. No account registration, payment, plan, alarm or paperless changes are authorized. No provider credentials or paid task runs were used for this verification.

The 29 entries below are configured for customer testing, not certified end-to-end successful connections.

| Provider | Reviewed sign-in entry |
| --- | --- |
| a.p.i. ALARM | https://sedonaapi.apialarm.com/Canada/Account/Login |
| Aviva | https://www.aviva.ca/myaviva/self-serve/landing?ui_locales=en |
| Bell | https://mybell.bell.ca/ |
| City of Mississauga Property Tax | https://mississauga.ca/apps/#/assessment/enter?redirect=eBill%20View |
| City of Toronto Property Tax | https://www.toronto.ca/services-payments/property-taxes-utilities/property-tax/property-tax-lookup/ |
| City of Toronto Water | https://www.toronto.ca/services-payments/property-taxes-utilities/utility-bill/utility-account-lookup/ |
| Cogeco | https://myaccount.cogeco.ca/ |
| East Gwillimbury Water | https://icityonline.aspgov.com/eastgwillimbury/live/ |
| Enercare | https://myaccount.enercare.ca/ |
| Fido | https://www.fido.ca/signin |
| Freedom Mobile | https://login.freedommobile.ca/ |
| Georgina Water | https://access.georgina.ca/ |
| GFL Environmental | https://myaccount.gflenv.com/ |
| Intact | https://apps.intactinsurance.com/cc/ |
| Koodo | https://www.koodomobile.com/selfserve |
| Region of Durham Water | https://secure6.i-doxs.net/RegionOfDurham/Secure/ViewBill.aspx |
| Region of Peel Water | https://peelregion.idoxs.ca/ |
| Reliance Home Comfort | https://myreliancehome.com/Reliance/SignIn.aspx |
| Richmond Hill Water | https://waterbill.richmondhill.ca/ |
| Sonnet | https://secure.sonnet.ca/ |
| Square One | https://www.squareone.ca/sales/account |
| Stouffville Water | https://vth.townofws.ca/ |
| TD Insurance | https://myinsurance.td.com/waw/ins/pol/application/login |
| TekSavvy | https://mysavvy.teksavvy.com/ |
| Telus | https://www.telus.com/my-telus |
| Telus SmartHome Security | https://www.telus.com/my-telus |
| The Co-operators | https://www.cooperators.ca/SSLPages/sign-in.aspx |
| Virgin Plus | https://www.virginplus.ca/en/login/index.html |
| Waste Connections | https://secure6.i-doxs.net/bdx/default.aspx?BillerID=H1ol0uvn2h |

## Verification

- 36 targeted provider tests passed, including source isolation, replay, canceled handoffs and Rogers pause.
- 40 rendered workflow checks passed across 320, 390 and 820 px, including all 29 hosted selections, Green Button guidance, Rogers and no-match uploads. These use mocked network/native boundaries and are not physical-device acceptance.
- 55 authenticated staging API checks passed. Synthetic user was removed. No provider runs were started.
- Root/mobile TypeScript and scoped ESLint passed.
- Staging Next build passed; iOS and Android Hermes exports passed.
- Full regression suite: 847/848 passed. The sole failure is the previously recorded test `statement-only activation preserves the database cap and keeps other AI tools disabled` in `tests/statement-reading-activation.test.ts`; this change does not edit its implementation.

## Delivery

Staging: https://nestify-mte7i2zb0-razakhan1195s-projects.vercel.app
Alias: https://staging.rezlee.com
Previous staging: https://nestify-nypkdvxtq-razakhan1195s-projects.vercel.app
Native code: apps/mobile. New finder UI requires a new app build to reach installed TestFlight/Android users. Native exports do not publish a phone build.
The staging deployment was built from the previously accepted staging snapshot with only the 24 recorded files overlaid. One pre-existing catalog difference was reconciled: Bell Smart Home had already been corrected to a.p.i. ALARM in the source/live registry.

## Research sources

- greenbutton: https://button.screamingpower.ca/guest/selectUtility/a6nyja
- oeb: https://www.oeb.ca/ontarios-energy-sector/list-licensed-companies
- alberta: https://ucahelps.alberta.ca/utility-choices/retailers-and-distributors/
- ccts: https://www.ccts-cprst.ca/industry/participating-service-providers/
- bc: https://www2.gov.bc.ca/gov/content/industry/electricity-alternative-energy/electricity/residential-electricity
- quebec: https://areq.org/informations/
- atlantic: https://mmeua.ca/
- canada: https://natural-resources.canada.ca/energy-sources/canada-electric-reliability-framework
- gas: https://www.cga.ca/about-us/
- cwwa: https://cwwa.ca/wp-content/uploads/2026/01/2025Directory_website.pdf
- calgary-water: https://www.enmax.com/customer-support/for-my-home/city-of-calgary-services-on-your-enmax-bill
- edmonton-water: https://www.epcor.com/ca/en/ab/edmonton/start-services/home.html
- territories: https://www.cer-rec.gc.ca/en/data-analysis/energy-markets/province-territory-energy-profiles/northwest-territories.html

Existing pilot providers and region/municipal aliases were retained from the reviewed Canadian provider catalogue and live staging registry. Exact pre/post configuration, manifests, source archives and screenshot evidence are in `docs/checkpoints/provider-directory-20261011`.

## Remaining before public acceptance

Real customer sign-in, MFA, issued-statement retrieval and interrupted/reconnection acceptance are still needed per Deck provider. Green Button provider-specific lifecycle acceptance remains open. This task does not sign off the rest of the app audit, beta device acceptance, or public release.
