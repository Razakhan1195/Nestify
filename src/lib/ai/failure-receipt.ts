import { GatewayRateLimitError } from "@ai-sdk/gateway";
import { APICallError } from "@ai-sdk/provider";
/** Only a trusted Gateway response explicitly reporting zero cost AND zero provider attempts
 * can settle a rejected call. A status code, timeout or missing receipt alone is insufficient.
 * Never return/log the error body: it may include customer input or provider credentials. */
export function verifiedZeroCostRejection(error: unknown): boolean {
 let current = error;
 for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
  if (GatewayRateLimitError.isInstance(current) && current.statusCode === 429) {
   const cause = current.cause;
   if (!APICallError.isInstance(cause) || cause.statusCode !== 429 || !cause.responseBody || cause.responseBody.length > 65536) return false;
   try {
    const url = new URL(cause.url);
    if (url.protocol !== "https:" || url.hostname !== "ai-gateway.vercel.sh" || url.username || url.password) return false;
    const data = JSON.parse(cause.responseBody);
    const gateway = data?.providerMetadata?.gateway;
    if (!gateway || ![0, "0", "0.0", "0.00"].includes(gateway.cost)) return false;
    const routing = gateway.routing;
    return routing?.totalProviderAttemptCount === 0 && Array.isArray(routing.modelAttempts) && routing.modelAttempts.length > 0 &&
     routing.modelAttempts.every((attempt: { providerAttemptCount?: unknown; providerAttempts?: unknown }) => attempt.providerAttemptCount === 0 && Array.isArray(attempt.providerAttempts) && attempt.providerAttempts.length === 0);
   } catch { return false; }
  }
  current = (current as { cause?: unknown }).cause;
 }
 return false;
}
