import { supabase } from "@/lib/supabase";

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Typed fetch wrapper for the Rezlee mobile-safe API contract
 * (`/api/mobile/v1/*` on the Next.js app). Attaches the current Supabase
 * access token as a Bearer header - the server re-validates it and scopes
 * every query through RLS, so this client never trusts the app itself.
 */
async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new ApiError("Not signed in.", 401);
  }

  return accessToken;
}

async function parseErrorBody(response: Response): Promise<never> {
  const body = await response.json().catch(() => null);
  throw new ApiError(
    body?.error ?? `Request failed with status ${response.status}`,
    response.status,
  );
}

export async function apiGet<T>(path: string): Promise<T> {
  if (!apiUrl) {
    throw new ApiError("EXPO_PUBLIC_API_URL is not configured.", 500);
  }

  const accessToken = await getAccessToken();

  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return parseErrorBody(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  if (!apiUrl) {
    throw new ApiError("EXPO_PUBLIC_API_URL is not configured.", 500);
  }

  const accessToken = await getAccessToken();

  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    return parseErrorBody(response);
  }

  return response.json() as Promise<T>;
}
