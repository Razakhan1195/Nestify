const DEFAULT_CUSTOMER_CODE = "a6nyja";

export function ezgbCustomerCode() {
  return process.env.EZGB_CUSTOMER_CODE?.trim() || DEFAULT_CUSTOMER_CODE;
}

// This is the origin registered with EZGB for BOTH success and error callbacks.
// It is independent of the mobile API / marketing site origin. Starting elsewhere
// loses the browser's return marker when the vendor returns to the registered host.
export function ezgbPublicBaseUrl(requestUrl?: string) {
  const configured = process.env.EZGB_PUBLIC_APP_URL?.trim();
  const candidate = configured || (process.env.NODE_ENV !== "production" ? requestUrl : undefined);
  if (!candidate) throw new Error("EZGB callback origin is not configured.");
  const url = new URL(candidate);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    (configured && (url.pathname !== "/" || url.search || url.hash))) {
    throw new Error("EZGB callback origin must be an HTTPS origin.");
  }
  return url.origin;
}

export function validEzgbUserIdentifier(value: string | null | undefined) {
  return Boolean(value && /^rz_[a-f0-9]{32}$/.test(value));
}
