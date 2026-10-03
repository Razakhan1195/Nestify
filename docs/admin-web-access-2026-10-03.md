# Admin routing and temporary customer web pause — 2026-10-03

User requested fixing rezlee.com/admin refresh entering the old customer web platform, and blocking customer web login for now. Production deployment was authorized by that request.

Live deployment: dpl_D2teaMdVStjiyWuCU711UxjrcVwL, https://nestify-db652205n-razakhan1195s-projects.vercel.app, promoted to https://rezlee.com. Source commit a12b46e on fix/admin-web-login-2026-10-03. Prior production dpl_E5k2Y7VdijhjXa97pkhszQKrRRRj retained for rollback.

The homepage previously redirected every authenticated session, including operators, to /app. It now routes approved operators to /admin and otherwise renders the public site. /login also returns approved operators to /admin. Existing UUID allowlist, confirmed-account checks, optional MFA configuration and admin callback remain intact.

Customer web access defaults off unless REZLEE_CUSTOMER_WEB_ENABLED is explicitly true. Middleware blocks /app and legacy aliases, plus signup, before auth refresh for both anonymous and existing sessions. Customer password login, signup and Google server actions also stop before creating sessions. Customer auth callback does not exchange login/signup codes; password recovery remains supported. The customer app layout has a second guard. The paused page contains no customer sign-in form. Shared Supabase sessions are not revoked.

No database changes, global Supabase auth changes, mobile code, API code, scheduling changes or staging features promoted. The release is based on the production website checkout, not the heavily modified mobile development checkout. Carry these guards forward deliberately when the mobile backend is later promoted; preserve its native confirmation and recovery callbacks.

Validation: lint and TypeScript passed; 23 regression tests passed; Vercel production build passed. Five candidate redirect/auth checks and 12 live public HTTP checks passed. Browser verified live admin sign-in and paused customer sign-in. Six local HTTP integration checks used synthetic auth against the real Next.js routes: operator homepage and login return to /admin; /admin returns to /admin/waitlist; two full dashboard reloads stay there; expired access-token refresh returns the admin dashboard and updated cookies. These are fixture-auth checks, not a claim of signing into the user’s real production account. Existing developer server was preserved; temporary test server was shut down.

Live HTTP results:

```json
[
  {
    "path": "/",
    "status": 200,
    "passed": true
  },
  {
    "path": "/login",
    "status": 200,
    "passed": true
  },
  {
    "path": "/app",
    "status": 303,
    "passed": true
  },
  {
    "path": "/app/bills",
    "status": 303,
    "passed": true
  },
  {
    "path": "/signup",
    "status": 303,
    "passed": true
  },
  {
    "path": "/dashboard",
    "status": 303,
    "passed": true
  },
  {
    "path": "/admin",
    "status": 307,
    "passed": true
  },
  {
    "path": "/admin/waitlist",
    "status": 307,
    "passed": true
  },
  {
    "path": "/admin/access",
    "status": 200,
    "passed": true
  },
  {
    "path": "/api/admin/waitlist",
    "status": 401,
    "passed": true
  },
  {
    "path": "/auth/callback?code=invalid&next=/app",
    "status": 307,
    "passed": true
  },
  {
    "path": "/forgot-password",
    "status": 200,
    "passed": true
  }
]
```
