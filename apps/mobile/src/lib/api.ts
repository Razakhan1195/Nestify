import { invalidateScreenData, clearScreenData, clearScreenAccess, screenEpoch } from "./screen-state";
import { createReadCoalescer } from "./inflight-reads";
import {createSessionTokenReader,SessionTokenError} from "./session-token";
import {requireAiSharing} from "./ai-sharing";
import {requestUsesAi} from "./ai-sharing-policy";
import { router } from "expo-router";
import Constants from "expo-constants";

import { supabase } from "@/lib/supabase";
import { multipartRequest } from "./multipart-request";

function configuredApiUrl() {
  return process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
}

function developmentApiUrl() {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;

  const withoutProtocol = hostUri.replace(/^https?:\/\//, "");
  const host =
    withoutProtocol.startsWith("[")
      ? withoutProtocol.slice(1, withoutProtocol.indexOf("]"))
      : withoutProtocol.split(":")[0];

  return host ? `http://${host}:3000` : null;
}

function resolveApiUrl() {
  if (__DEV__) {
    return configuredApiUrl() ?? developmentApiUrl();
  }

  return configuredApiUrl();
}

const apiUrl = resolveApiUrl();

if (__DEV__) {
  console.log("[Rezlee API]", apiUrl ?? "not configured");
}

export class ApiError extends Error {
  status: number;

  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Typed fetch wrapper for the Rezlee mobile-safe API contract
 * (`/api/mobile/v1/*` on the Next.js app). Attaches the current Supabase
 * access token as a Bearer header - the server re-validates it and scopes
 * every query through RLS, so this client never trusts the app itself.
 */
const readSessionToken=createSessionTokenReader(supabase.auth);
const inFlightReads = createReadCoalescer();
async function getAccessToken(expectedUserId?: string) {
 try{return await sessionDeadline(readSessionToken(expectedUserId));}
 catch(error){if(error instanceof SessionTokenError)throw new ApiError(error.message,error.status);throw error;}
}

function sessionDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError("Your session could not be checked. Try again.", 503)), 10_000);
  })]).finally(() => clearTimeout(timer));
}
function assertCurrentRequest(epoch: number) {
  if (epoch !== screenEpoch()) throw new ApiError("Your account changed. Reopen this screen to continue.", 409);
}
function confirmedMutation(path: string, epoch: number) {
  assertCurrentRequest(epoch);
  if (invalidateScreenData(path)) inFlightReads.invalidate();
}
/** Explicit recovery for a rejected session; does not replay any request. */
export async function renewApiSession() {
 try { await sessionDeadline(readSessionToken(undefined,true)); }
 catch(error) { if(error instanceof SessionTokenError)throw new ApiError(error.message,error.status); throw error; }
}

async function parseErrorBody(response: Response, requestToken?: string, path = "", epoch?: number): Promise<never> {
  const body = await response.json().catch(() => null);
  const current = requestToken ? await sessionDeadline(supabase.auth.getSession()) : null;
  if (epoch !== undefined) assertCurrentRequest(epoch);
  const currentToken = Boolean(requestToken && current?.data.session?.access_token === requestToken);
  if (currentToken && [401, 423].includes(response.status)) clearScreenData();
  if (currentToken && response.status === 403) clearScreenAccess(path);
  if (currentToken && response.status === 423) router.replace("/delete-account");
  if (currentToken && response.status === 402) router.push("/membership");
  if (response.status === 401 && body?.error === "Your sign-in changed. Please sign in again." && requestToken) {

    // An old response must never sign out an account that signed in meanwhile.
    if (currentToken) {
      const result = await supabase.auth.signOut({ scope: "local" });
      if (!result.error) router.replace({ pathname: "/(auth)/login", params: { sessionChanged: "1" } });
    }
  }
  throw new ApiError(
    body?.error ?? (response.status === 413 ? "Choose a file up to 4 MB, or enter the details manually." : `Request failed with status ${response.status}`),
    response.status,
    body,
  );
}

export async function apiGet<T>(path: string, options?: { timeoutMs?: number; expectedUserId?: string }): Promise<T> {
  if (!apiUrl) throw new ApiError("EXPO_PUBLIC_API_URL is not configured.", 500);
  const epoch = screenEpoch();
  const accessToken = await getAccessToken(options?.expectedUserId);
  assertCurrentRequest(epoch);
  const timeoutMs = options?.timeoutMs ?? 20_000;
  // Session token scopes sharing to the exact authenticated session. Nothing is persisted.
  return inFlightReads.run<T>([epoch, accessToken, path, timeoutMs].join("\n"), async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: controller.signal,
      });
      assertCurrentRequest(epoch);
      if (!response.ok) return await parseErrorBody(response, accessToken, path, epoch);
      const result = await response.json() as T;
      assertCurrentRequest(epoch);
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new ApiError("Could not check the latest status. Please try again.", 408);
      if (error instanceof TypeError) throw new ApiError("Connection unavailable. Check your internet connection and try again.", 0);
      throw error;
    } finally { clearTimeout(timeout); }
  });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options?: { timeoutMs?: number; expectedUserId?: string },
): Promise<T> {
  const epoch = screenEpoch();
  if (!apiUrl) {
    throw new ApiError("EXPO_PUBLIC_API_URL is not configured.", 500);
  }

  const initial = requestUsesAi(path,body) ? (await supabase.auth.getSession()).data.session?.user.id : undefined;
  try { await requireAiSharing(apiUrl,path,body); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Could not check AI sharing permission.",428); }
  const accessToken = await getAccessToken(options?.expectedUserId ?? initial);
  assertCurrentRequest(epoch);
  const controller = options?.timeoutMs ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), options?.timeoutMs)
    : null;

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
    assertCurrentRequest(epoch);
    if (!response.ok) return await parseErrorBody(response, accessToken, path, epoch);
    const result = await response.json() as T;
    confirmedMutation(path, epoch);
    return result;
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new ApiError("Could not confirm the save. Check the latest status before trying again.", 408);
    }
    if (error instanceof TypeError) throw new ApiError("Could not confirm the save. Check your connection and try again.", 0);
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

}

export async function apiPatch<T>(path: string, body?: unknown, options?: { timeoutMs?: number }): Promise<T> {
  const epoch = screenEpoch();
  if (!apiUrl) throw new ApiError("EXPO_PUBLIC_API_URL is not configured.", 500);
  const accessToken = await getAccessToken();
  assertCurrentRequest(epoch);
  const controller = options?.timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), options?.timeoutMs) : null;
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, signal: controller?.signal,
    });
    assertCurrentRequest(epoch);
    if (!response.ok) return await parseErrorBody(response, accessToken, path, epoch);
    const result = await response.json() as T;
    confirmedMutation(path, epoch);
    return result;
  } catch (error) {
    if (controller?.signal.aborted) throw new ApiError("Could not confirm the save. Please try again.", 408);
    throw error;
  } finally { if (timeout) clearTimeout(timeout); }
}

export async function apiDelete<T>(path: string): Promise<T> {
  const epoch = screenEpoch();
  if (!apiUrl) throw new ApiError("EXPO_PUBLIC_API_URL is not configured.", 500);
  const accessToken = await getAccessToken();
  assertCurrentRequest(epoch);
  const response = await fetch(`${apiUrl}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  assertCurrentRequest(epoch);
  if (!response.ok) return parseErrorBody(response, accessToken, path, epoch);
  const result = await response.json() as T;
  confirmedMutation(path, epoch);
  return result;
}

export async function apiFormPost<T>(path: string, body: FormData, options?: { timeoutMs?: number }): Promise<T> {
  const epoch = screenEpoch();
  if (!apiUrl) throw new ApiError("EXPO_PUBLIC_API_URL is not configured.", 500);
  const initial = requestUsesAi(path,undefined) ? (await supabase.auth.getSession()).data.session?.user.id : undefined;
  try { await requireAiSharing(apiUrl,path,undefined); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Could not check AI sharing permission.",428); }
  const accessToken = await getAccessToken(initial);
  assertCurrentRequest(epoch);
  const controller = options?.timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), options?.timeoutMs) : null;
  try {
    const response = await multipartRequest(`${apiUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: controller?.signal,
    });
    assertCurrentRequest(epoch);
    if (!response.ok) return await parseErrorBody(response, accessToken, path, epoch);
    const result = await response.json() as T;
    confirmedMutation(path, epoch);
    return result;
  } catch (error) {
    if (controller?.signal.aborted) throw new ApiError("The upload took too long to confirm. Please try again.", 408);
    throw error;
  } finally { if (timeout) clearTimeout(timeout); }
}

/** Receipt grants access only to deletion status after the Auth account is gone. */
export async function apiDeletionReceipt<T>(receipt: { requestId: string; receiptToken: string }): Promise<T> {
  if (!apiUrl) throw new ApiError("Account status is unavailable.", 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiUrl}/api/mobile/v1/account/deletion/status`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(receipt), signal: controller.signal,
    });
    if (!response.ok) return await parseErrorBody(response);
    return await response.json() as T;
  } finally { clearTimeout(timeout); }
}
