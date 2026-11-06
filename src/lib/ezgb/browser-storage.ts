import {
  EZGB_BROWSER_STORAGE, EZGB_BROWSER_TTL, ezgbBrowserReturnUrl,
} from "../../../apps/mobile/src/lib/ezgb-browser-contract";

export const EZGB_RETURN_COOKIE = "__Host-rezlee-ezgb-return";

// Only a random, short-lived return marker is stored here: no account identity,
// signed connection intent, utility credentials or API access token.
export function saveEzgbBrowserMarker(marker: string | null, storage: Storage | null, document: Pick<Document, "cookie">) {
  let sessionSaved = false;
  try {
    storage?.removeItem(EZGB_BROWSER_STORAGE);
    if (marker) {
      storage?.setItem(EZGB_BROWSER_STORAGE, marker);
      sessionSaved = storage?.getItem(EZGB_BROWSER_STORAGE) === marker;
    }
  } catch { /* Some private browser modes block session storage. */ }
  let cookieSaved = false;
  try {
    document.cookie = EZGB_RETURN_COOKIE + "=" + (marker ? encodeURIComponent(marker) : "") +
      "; Path=/; Secure; SameSite=Lax; Max-Age=" + (marker ? EZGB_BROWSER_TTL / 1000 : 0);
    cookieSaved = marker !== null && readCookieMarker(document.cookie) === marker;
  } catch { /* Keep the session-storage path usable if cookies are blocked. */ }
  return !marker || sessionSaved || cookieSaved;
}

function readCookieMarker(cookies: string) {
  try {
    const matches = cookies.split(";").map(part => part.trim())
      .filter(part => part.startsWith(EZGB_RETURN_COOKIE + "="));
    return matches.length === 1 ? decodeURIComponent(matches[0].slice(EZGB_RETURN_COOKIE.length + 1)) : null;
  } catch { return null; }
}

export function readEzgbBrowserReturn(storage: Storage | null, document: Pick<Document, "cookie">, outcome: "success" | "error") {
  try {
    const href = ezgbBrowserReturnUrl(storage?.getItem(EZGB_BROWSER_STORAGE) ?? null, outcome);
    if (href) return href;
  } catch { /* Fall back to the host-only marker after a new-tab return. */ }
  try { return ezgbBrowserReturnUrl(readCookieMarker(document.cookie), outcome); }
  catch { return null; }
}
