export type StorePlan = { packageType: string; product: { identifier: string; currencyCode: string; price: number; subscriptionPeriod: string | null } };
/** Trust approved product identity and actual period. StoreKit owns localized pricing,
 * including TestFlight storefront metadata; a CAD-only numeric filter hides valid plans. */
export function eligibleStorePlan(plan: StorePlan, approvedProducts: readonly string[]) {
  if (!approvedProducts.includes(plan.product.identifier) || !/^[A-Z]{3}$/.test(plan.product.currencyCode)
      || !Number.isFinite(plan.product.price) || plan.product.price <= 0) return false;
  return (plan.packageType === "MONTHLY" && plan.product.subscriptionPeriod === "P1M")
    || (plan.packageType === "ANNUAL" && plan.product.subscriptionPeriod === "P1Y");
}
