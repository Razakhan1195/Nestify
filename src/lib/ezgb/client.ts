import type {
  EzgbAccountInfo,
  EzgbAccountRow,
  EzgbBillData,
} from "@/lib/ezgb/types";

const DEFAULT_BASE_URL = "https://button.screamingpower.ca";
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 4;

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export class EzgbApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "EzgbApiError";
  }
}

export class EzgbConfigurationError extends Error {
  constructor() { super("Utility importing is temporarily unavailable in this environment. Your authorization does not need to be repeated."); this.name = "EzgbConfigurationError"; }
}

function config() {
  const clientId = process.env.EZGB_CLIENT_ID?.trim();
  const clientSecret = process.env.EZGB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new EzgbConfigurationError();
  }

  return {
    baseUrl: (process.env.EZGB_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
    clientId,
    clientSecret,
    apiVersion: process.env.EZGB_API_VERSION?.trim() || "2",
  };
}

function tokenExpiry(payload: {
  expires?: unknown;
  expires_in?: unknown;
  accessTokenExpiresAt?: unknown;
}) {
  if (typeof payload.expires_in === "number" && payload.expires_in > 0) {
    return Date.now() + payload.expires_in * 1000;
  }
  if (typeof payload.expires_in === "string") {
    const seconds = Number(payload.expires_in);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Date.now() + seconds * 1000;
    }
  }

  const stamp =
    typeof payload.expires === "string"
      ? payload.expires
      : typeof payload.accessTokenExpiresAt === "string"
        ? payload.accessTokenExpiresAt
        : null;
  if (stamp) {
    const parsed = Date.parse(stamp);
    if (Number.isFinite(parsed) && parsed > Date.now()) return parsed;
  }

  return Date.now() + 55 * 60 * 1000;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { timeoutMs?: number; maxRetries?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let delayMs = 1_000;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      const transient = response.status === 429 || response.status >= 500;
      if (!transient || attempt === maxRetries - 1) return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
    }

    await sleep(delayMs);
    delayMs *= 2;
  }

  throw new Error("EZGB request exhausted retries.");
}

async function accessToken(options: { timeoutMs?: number; maxRetries?: number } = {}) {
  if (tokenCache && tokenCache.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return tokenCache.token;
  }

  const { baseUrl, clientId, clientSecret } = config();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetchWithRetry(
    `${baseUrl}/oauth/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    },
    options,
  );

  const text = await response.text();
  if (!response.ok) {
    throw new EzgbApiError("EZGB authentication failed.", response.status, text);
  }

  const payload = JSON.parse(text) as {
    accessToken?: string;
    access_token?: string;
    expires?: string;
    expires_in?: number | string;
    accessTokenExpiresAt?: string;
  };
  const token = payload.accessToken ?? payload.access_token;
  if (!token) throw new Error("EZGB token response did not include a token.");

  tokenCache = {
    token,
    expiresAt: tokenExpiry(payload),
  };
  return token;
}

async function apiJson<T>(path: string, init?: RequestInit, options: { timeoutMs?: number; maxRetries?: number } = {}): Promise<T> {
  const { baseUrl, apiVersion } = config();
  let token = await accessToken(options);

  const request = () =>
    fetchWithRetry(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-EZGB-API-Version": apiVersion,
        ...(init?.headers ?? {}),
      },
    }, options);

  let response = await request();
  if (response.status === 401) {
    tokenCache = null;
    token = await accessToken(options);
    response = await request();
  }

  const text = await response.text();
  if (!response.ok) {
    throw new EzgbApiError(
      `EZGB request failed for ${path}.`,
      response.status,
      text.slice(0, 800),
    );
  }

  return text ? (JSON.parse(text) as T) : (null as T);
}

export function createEzgbClient() {
  return {
    getAllAccounts() {
      return apiJson<EzgbAccountRow[]>("/api/allAccounts");
    },
    getUserAccounts(userIdentifier: string, options?: { timeoutMs?: number; maxRetries?: number }) {
      return apiJson<EzgbAccountRow[]>(
        `/api/userAccounts/${encodeURIComponent(userIdentifier)}`, undefined, options,
      );
    },
    getAccountInfo(accountId: string) {
      return apiJson<EzgbAccountInfo>(
        `/api/accountInfo/${encodeURIComponent(accountId)}`,
      );
    },
    getBills(accountId: string, options?: { timeoutMs?: number; maxRetries?: number }) {
      return apiJson<EzgbBillData>(
        `/api/accountData/${encodeURIComponent(accountId)}/bills/json`, undefined, options,
      );
    },
    // EZGB confirmed the type is "intervals"; "meter" is not an accountData type.
    // Keep the payload unknown until the API shape, units and timestamps are validated.
    getIntervals(accountId: string, options: { timeoutMs?: number; maxRetries?: number } = {}) {
      return apiJson<unknown>(
        `/api/accountData/${encodeURIComponent(accountId)}/intervals/json`,
        undefined,
        options,
      );
    },
    /** @deprecated Use getIntervals. Retained for existing callers. */
    getMeterData(accountId: string) {
      return apiJson<unknown>(
        `/api/accountData/${encodeURIComponent(accountId)}/intervals/json`,
      );
    },
    deleteAuthorization(authorizationId: string, options: { timeoutMs?: number; maxRetries?: number } = {}) {
      return apiJson<{ success: boolean; message?: string }>(
        `/api/deleteAuthorization/${encodeURIComponent(authorizationId)}`,
        { method: "DELETE" },
        options,
      );
    },
  };
}

export function resetEzgbTokenCacheForTests() {
  tokenCache = null;
}
