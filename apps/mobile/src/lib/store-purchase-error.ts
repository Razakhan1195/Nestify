export type StorePurchaseFailure = { kind: "account" | "restore"; message: string };
/** RevenueCat SDK codes 7 and 13 mean the receipt is owned by another app account.
 * Never show raw vendor errors (which can contain account or receipt details).
 */
export function storePurchaseFailure(error: unknown): StorePurchaseFailure {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "7" || code === "13") return {
    kind: "account",
    message: "This store purchase is linked to another Rezlee account. Sign in to the Rezlee account you used to subscribe, then restore purchases. Don’t buy again.",
  };
  return { kind: "restore", message: "We couldn’t confirm the store result. Use Restore purchases before buying again." };
}
