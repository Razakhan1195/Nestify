import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const OFFER_LIMIT = 10000;
export function normalizedEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 &&
    /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
      email,
    )
    ? email
    : null;
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function unsubscribeToken(id: string, secret: string) {
  return createHmac("sha256", secret)
    .update("waitlist-unsubscribe:" + id)
    .digest("hex");
}
export function validUnsubscribe(id: string, token: string, secret: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(
    Buffer.from(token, "hex"),
    Buffer.from(unsubscribeToken(id, secret), "hex"),
  );
}
export function csvCell(value: unknown) {
  const s = String(value ?? "");
  return (
    '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"'
  );
}
export function safePage(value: string | null) {
  const n = Number(value ?? 0);
  return Number.isSafeInteger(n) && n >= 0 && n <= 10000 ? n : 0;
}
export function sameOrigin(request: Request, origin: string) {
  return request.headers.get("origin") === origin;
}
