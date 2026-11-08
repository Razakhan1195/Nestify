/** Keep the currency's minor units when displaying financial records. */
export function formatCurrency(amount: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    currency,
    style: "currency",
  }).format(amount);
}
