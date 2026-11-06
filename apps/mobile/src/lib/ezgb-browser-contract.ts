export const EZGB_BROWSER_RETURN = "rezlee://ezgb-return";
export const EZGB_BROWSER_TTL = 20 * 60 * 1000;
export const EZGB_BROWSER_STORAGE = "rezlee.ezgb.browser.v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EzgbBrowserAttempt = {
  id: string;
  userId: string;
  userIdentifier: string;
  createdAt: number;
  connectionIntent?: string;
  returned?: boolean;
  checkOnly?: boolean;
  utilityName?: string;
};

export function readEzgbAttempt(raw: string | null, now = Date.now()): EzgbBrowserAttempt | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || !uuid.test(value.id) || typeof value.userId !== "string" || !value.userId ||
      !/^rz_[a-f0-9]{32}$/.test(value.userIdentifier) || !Number.isFinite(value.createdAt) ||
      value.createdAt > now || now - value.createdAt > EZGB_BROWSER_TTL) return null;
    if (value.connectionIntent !== undefined && (typeof value.connectionIntent !== "string" || !value.connectionIntent || value.connectionIntent.length > 15000)) return null;
    if (value.checkOnly !== undefined && typeof value.checkOnly !== "boolean") return null;
    if (value.checkOnly && (typeof value.utilityName !== "string" || !value.utilityName.trim() || value.utilityName.length > 120)) return null;
    return value;
  } catch { return null; }
}

export function ezgbBrowserStartUrl(authorizationUrl: string, id: string) {
  const url = new URL(authorizationUrl);
  if (url.protocol !== "https:" || url.username || url.password ||
    url.pathname !== "/integrations/ezgb/authorize" || !uuid.test(id)) {
    throw Error("Couldn’t open the utility connection securely. Please start again.");
  }
  // The random return marker is kept out of server request logs and referrers.
  url.hash = new URLSearchParams({ rezleeAttempt: id }).toString();
  return url.toString();
}

export function ezgbBrowserCallback(url: string, attempt: EzgbBrowserAttempt | null, userId?: string) {
  const value = new URL(url);
  if (!attempt || userId !== attempt.userId || !readEzgbAttempt(JSON.stringify(attempt)) ||
    value.protocol !== "rezlee:" || value.hostname !== "ezgb-return" || value.pathname !== "" ||
    value.username || value.password || value.port || value.hash ||
    value.searchParams.getAll("attempt").length !== 1 ||
    value.searchParams.get("attempt") !== attempt.id ||
    value.searchParams.getAll("outcome").length !== 1) {
    throw Error("This connection has expired or belongs to another sign-in. Please start again.");
  }
  const outcome = value.searchParams.get("outcome");
  if (outcome !== "success" && outcome !== "error") throw Error("The utility connection wasn’t confirmed. Please start again.");
  return outcome;
}

export function ezgbBrowserReturnUrl(raw: string | null, outcome: "success" | "error", now = Date.now()) {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || !uuid.test(value.id) || !Number.isFinite(value.createdAt) ||
      value.createdAt > now || now - value.createdAt > EZGB_BROWSER_TTL) return null;
    return EZGB_BROWSER_RETURN + "?" + new URLSearchParams({ attempt: value.id, outcome });
  } catch { return null; }
}

export function ezgbBrowserMarker(hash: string, now = Date.now()) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const id = params.get("rezleeAttempt");
  return id && uuid.test(id) && params.getAll("rezleeAttempt").length === 1
    ? JSON.stringify({ id, createdAt: now }) : null;
}

export function ezgbEmbeddedCallback(url: string, successUrl: string, errorUrl: string) {
  try {
    const value = new URL(url);
    for (const [outcome, expected] of [["success", successUrl], ["error", errorUrl]] as const) {
      const target = new URL(expected);
      if (value.protocol === "https:" && !value.username && !value.password &&
        value.origin === target.origin && value.pathname === target.pathname) return outcome;
    }
  } catch { /* Invalid URL is not a callback. */ }
  return null;
}
