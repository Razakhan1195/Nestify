# Rezlee Mobile

Native iOS/Android app for Rezlee, built with Expo (SDK 57), Expo Router, and
TypeScript. This is a real React Native app - no WebView, no ported HTML.

This is **Milestone 2**: native app shell, email/password auth, 5-tab
navigation, a fully data-wired Home screen, and a full native Bills
experience (list, filters, detail view, mark as paid). Care and Vault still
show native "coming soon" screens; their full experiences ship next.

## How this app talks to Rezlee

This app is a client of the main Rezlee Next.js app's mobile-safe API:

- `src/lib/supabase/mobile.ts` and `src/app/api/mobile/v1/*` (in the root
  `src/` folder, not here) - a bearer-token API surface. Home is read-only;
  Bills also exposes a `mark-paid` mutation.
- The mobile app signs in directly against the same Supabase project as the
  web app ("one Rezlee account"), then sends the resulting access token as
  `Authorization: Bearer <token>` on every API call.
- The server re-validates that token with Supabase on every request and
  scopes all queries through the same Postgres Row Level Security policies
  the web app uses - the mobile app has no elevated access.
- All Home screen numbers and logic (dashboard state, attention items,
  coming-up list, monthly summary) are computed by the exact same pure
  functions the web dashboard uses (`src/lib/product/*.ts`), reused as-is
  from the API route. Mobile and web will never disagree about what's true.
- Marking a bill paid on mobile runs the exact same mutation as the web
  "Mark paid" button (`src/lib/product/bill-mutations.ts`, shared by the web
  server action and the mobile API route) - same payment update, same
  attention-resolution and activity/timeline side effects, on both surfaces.

## Local setup

1. Copy `.env.example` to `.env` and fill in:
   - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` - same
     values as the web app's `NEXT_PUBLIC_SUPABASE_URL` /
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - `EXPO_PUBLIC_API_URL` - where the Next.js app is running (e.g.
     `http://localhost:3000`, a Vercel preview URL, or `https://rezlee.com`).
2. `npm install`
3. `npm run start` (or `npm run ios` / `npm run android` once you have a
   simulator or device set up)

This sandbox cannot run Metro, a simulator, or a physical device - the code
above was written and typechecked here, but running and visually verifying
it happens on your machine or in EAS.

## What you'll need to create before a real build/release

None of this exists yet. Nothing below is faked or auto-configured - you'll
need to set each of these up yourself:

### 1. Expo / EAS account
- Create a free account at https://expo.dev if you don't have one.
- Run `npx eas login`, then `npx eas init` from this directory to create a
  real EAS project and get a project ID.
- Paste that ID into `app.json` → `expo.extra.eas.projectId` (currently
  `REPLACE_WITH_EAS_PROJECT_ID`).

### 2. Apple Developer account (iOS builds/TestFlight/App Store)
- Requires an active Apple Developer Program membership (paid, per Apple).
- `eas build --platform ios` will walk you through creating/registering the
  bundle identifier `com.rezlee.app` (change this in `app.json` if you want
  a different one) and generating signing credentials - EAS can manage
  these for you interactively.
- TestFlight/App Store submission uses `eas submit --platform ios`, which
  needs an App Store Connect API key (created in App Store Connect →
  Users and Access → Integrations).

### 3. Google Play Console account (Android builds/release)
- Requires a one-time Google Play Console developer registration fee.
- `eas build --platform android` generates a signed `.aab`. First release
  to Play Console is normally uploaded manually; later releases can use
  `eas submit --platform android` with a Google Play service account JSON
  key (created in Google Cloud Console, granted access in Play Console →
  Setup → API access).

### 4. Environment values per build profile
`eas.json` has placeholder `EXPO_PUBLIC_API_URL` values for `preview` and
`production` profiles - update `REPLACE_WITH_PREVIEW_URL` /
`REPLACE_WITH_PRODUCTION_URL` once you know which deployed URL each build
should point at.

### 5. App icon and splash image
`assets/icon.png` and `assets/splash.png` are referenced in `app.json` but
not included yet - add real 1024x1024 (icon) and any splash artwork before
your first build; Expo will fail to build without them.

### Not included in this milestone (by design, not oversight)
- Google/Apple social sign-in - only email/password is wired up per the
  agreed scope. The `rezlee://` URL scheme is already configured in
  `app.json` so deep links and OAuth redirects can be added later without
  reconfiguring the app.
- Push notifications.
- Write actions outside Bills (complete a Care task, upload a document or
  photo) - Bills is the first full read/write vertical.
- Care/Vault full screens - still native placeholders that point users back
  to the web app.
