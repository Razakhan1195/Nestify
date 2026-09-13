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
export async function apiGet<T>(path: string): Promise<T> {
  if (!apiUrl) {
    throw new ApiError("EXPO_PUBLIC_API_URL is not configured.", 500);
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new ApiError("Not signed in.", 401);
  }

  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.error ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}
