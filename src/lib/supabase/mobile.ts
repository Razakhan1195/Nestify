import { mobileReadBudgetFetch } from "@/lib/supabase/mobile-read-budget";
import { rememberMobileReadContext } from "@/lib/supabase/mobile-read-context";
import { effectiveBillTable } from "@/lib/product/bill-records";
import { stagingDiagnosticFetch } from "@/lib/supabase/performance-diagnostics";
import { proFeatureForRequest } from "@/lib/membership/policy";
import { accountDeletionEnabled } from "@/lib/account/operations";
import {
  createClient as createSupabaseJsClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";

export type MobileAuthResult =
  | {
      user: { id: string; email: string | null; user_metadata?: Record<string, unknown> };
      supabase: SupabaseClient;
      error?: undefined;
    }
  | { user?: undefined; supabase?: undefined; error: { status: number; message: string } };

function extractBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1].trim() : null;
}

/**
 * Authenticates a mobile request using the Supabase access token the client
 * received at sign-in. The token is validated against Supabase (never
 * trusted blindly), and the returned client is scoped to that user so
 * Postgres RLS applies exactly as it does for the web app - no service role
 * key, no bypassing row security.
 */
export async function authenticateMobileRequest(
  request: Request,
): Promise<MobileAuthResult> {
  const token = extractBearerToken(request.headers.get("authorization"));

  if (!token) {
    return {
      error: {
        status: 401,
        message: "Missing bearer token.",
      },
    };
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  const boundedRead = process.env.REZLEE_MOBILE_READ_BUDGET_ENABLED === "true" && request.method === "GET"
    && ["home", "bills", "vault", "care", "shared-expenses", "purchase-decisions"].some(route => new URL(request.url).pathname === `/api/mobile/v1/${route}`);
  // Keep the experimental HTTP client out of normal worker initialization.
  const transport = boundedRead && process.env.REZLEE_MOBILE_HTTP_POOL_ENABLED === "true"
    ? (await import("@/lib/supabase/mobile-http-transport")).mobileHttpTransport(supabaseUrl)
    : undefined;
  const baseFetch = transport?.fetch ?? globalThis.fetch;
  const diagnosticFetch = stagingDiagnosticFetch(request, supabaseUrl, baseFetch, transport?.stats);
  const supabase = createSupabaseJsClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: boundedRead ? mobileReadBudgetFetch(request, diagnosticFetch ?? baseFetch) : diagnosticFetch,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null = null;
  let contextAccess: string | undefined;
  const useContext = process.env.REZLEE_MOBILE_AUTH_CONTEXT_ENABLED === "true"
    && process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED === "true" && accountDeletionEnabled();
  if (useContext) {
    // The authenticated RPC is reached only after Supabase verifies the bearer JWT.
    // It also checks current Auth user/session state; no locally decoded claim is trusted.
    const path = new URL(request.url).pathname;
    const bootstrap = process.env.REZLEE_MOBILE_READ_BOOTSTRAP_ENABLED === "true" && request.method === "GET"
      && ["home", "bills", "vault", "care", "shared-expenses", "purchase-decisions"].some(route => path === `/api/mobile/v1/${route}`);
    const screen = bootstrap && process.env.REZLEE_MOBILE_SCREEN_SNAPSHOT_ENABLED === "true"
      && ((path === "/api/mobile/v1/bills" && !new URL(request.url).searchParams.has("recordId")) || path === "/api/mobile/v1/care" || path === "/api/mobile/v1/vault"
        || (path === "/api/mobile/v1/purchase-decisions" && !new URL(request.url).searchParams.has("id"))
        || (path === "/api/mobile/v1/shared-expenses" && !["id", "before", "billId"].some(key => new URL(request.url).searchParams.has(key))));
    const result = screen
      ? await supabase.rpc("rezlee_mobile_screen_bootstrap", { p_screen: path.split("/").at(-1), p_effective: effectiveBillTable() !== "bills" })
      : bootstrap
      ? await supabase.rpc("rezlee_mobile_read_bootstrap", { p_snapshot: path === "/api/mobile/v1/home" && process.env.REZLEE_HOME_SNAPSHOT_ENABLED === "true", p_effective: effectiveBillTable() !== "bills" })
      : await supabase.rpc("rezlee_authenticated_mobile_context");
    if (result.error) {
      const invalidSession = result.status === 401 || result.status === 403
        || ["PT401", "PGRST301", "PGRST302", "PGRST303"].includes(result.error.code);
      return { error: { status: invalidSession ? 401 : 503,
        message: invalidSession ? "Invalid or expired session." : "Account access could not be checked." } };
    }
    const value = result.data;
    if (!value || typeof value !== "object" || !value.user || typeof value.user.id !== "string"
      || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.user.id)
      || (value.user.email !== null && typeof value.user.email !== "string")
      || !value.user.user_metadata || typeof value.user.user_metadata !== "object" || Array.isArray(value.user.user_metadata)
      || !["active", "deleting", "reauthenticate"].includes(value.access))
      return { error: { status: 503, message: "Account access could not be checked." } };
    user = value.user;
    contextAccess = value.access;
    if (bootstrap && value.access === "active" && !rememberMobileReadContext(supabase, value.user.id, value))
      return { error: { status: 503, message: "Your home could not be checked." } };
  } else {
    const result = await supabase.auth.getUser(token);
    if (!result.error) user = result.data.user;
  }
  if (!user) return { error: { status: 401, message: "Invalid or expired session." } };

  if (process.env.REZLEE_APPLE_NOTIFICATIONS_ENABLED === "true") {
    const access = contextAccess ? { data: contextAccess, error: null } : await supabase.rpc("rezlee_mobile_access");
    if (access.error?.code === "PT401") return { error: { status: 401, message: "Your sign-in changed. Please sign in again." } };
    if (access.error) return { error: { status: 503, message: "Account access could not be checked." } };
    if (access.data === "reauthenticate") return { error: { status: 401, message: "Your sign-in changed. Please sign in again." } };
    if (access.data === "deleting" && !new URL(request.url).pathname.startsWith("/api/mobile/v1/account/deletion"))
      return { error: { status: 423, message: "Your account is being deleted. Open deletion status to check progress." } };
    if (!["active", "deleting"].includes(access.data)) return { error: { status: 503, message: "Account access could not be checked." } };
  } else if (accountDeletionEnabled() && !new URL(request.url).pathname.startsWith("/api/mobile/v1/account/deletion")) {
    const active = await supabase.rpc("rezlee_account_active", { p_user: user.id });
    if (active.error) return { error: { status: 503, message: "Account access could not be checked." } };
    if (!active.data) return { error: { status: 423, message: "Your account is being deleted. Open deletion status to check progress." } };
  }
  if (process.env.REZLEE_MEMBERSHIPS_ENABLED === "true" && proFeatureForRequest(new URL(request.url).pathname, request.method)) {
    const {requirePro,MembershipRequired}=await import("@/lib/membership/server");
    try { await requirePro(user.id); } catch (e) { return { error: { status: e instanceof MembershipRequired ? 402 : 503, message: e instanceof MembershipRequired ? e.message : "Membership could not be checked. Try again." } }; }
  }
  return {
    user: { id: user.id, email: user.email ?? null, user_metadata: user.user_metadata },
    supabase,
  };
}
