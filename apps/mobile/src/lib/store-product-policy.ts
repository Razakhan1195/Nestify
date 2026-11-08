export type StorePlan = { packageType: string; product: { identifier: string; currencyCode: string; price: number; subscriptionPeriod: string | null } };
/** Canadian launch: never display or purchase a foreign-currency offering. */
export function eligibleStorePlan(plan: StorePlan, approvedProducts: readonly string[]) {
  if (!approvedProducts.includes(plan.product.identifier) || plan.product.currencyCode !== "CAD"
      || !Number.isFinite(plan.product.price)) return false;
  return (plan.packageType === "MONTHLY" && plan.product.subscriptionPeriod === "P1M" && plan.product.price === 7.99)
    || (plan.packageType === "ANNUAL" && plan.product.subscriptionPeriod === "P1Y" && plan.product.price === 80);
}
