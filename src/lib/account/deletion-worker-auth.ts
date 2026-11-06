import { createHmac, timingSafeEqual } from "node:crypto";
import { validBearer } from "@/lib/security/bearer";
const scope = "rezlee-account-deletion-v1";
/** The existing scheduler signs a scoped, short-lived message; its persistent
 * secret never enters the HTTP request queue or a URL. No user id is accepted. */
export function validDeletionWorker(headers: Headers, secrets: { cron?: string; scheduler?: string }, now = Date.now()) {
  if (validBearer(headers.get("authorization"), secrets.cron)) return true;
  const timestamp = headers.get("x-rezlee-deletion-time"), signature = headers.get("x-rezlee-deletion-signature");
  if (!secrets.scheduler || !timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const age = now / 1000 - Number(timestamp);
  if (age < -30 || age > 300) return false;
  const expected = createHmac("sha256", secrets.scheduler).update(scope + ":" + timestamp).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}
