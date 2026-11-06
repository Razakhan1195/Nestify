import { utilitySnapshots, type SnapshotBill, type SnapshotUtility, type UtilitySnapshot } from "./utility-snapshot";

export type UtilityChoice = {
  key: string; providerId: string; providerName: string; category: string;
  accountLabel: string | null; snapshot: UtilitySnapshot | null; href: string;
};
export function utilityChoices(bills: SnapshotBill[], utilities: SnapshotUtility[]): UtilityChoice[] {
  const snapshots = utilitySnapshots(bills, utilities);
  const categories: Record<string, string> = { electricity: "Electricity", gas: "Gas", water: "Water" };
  const order = ["Electricity", "Gas", "Water", "Utility"];
  return utilities.flatMap(utility => {
    const history = bills.filter(b => b.providerId === utility.providerId && b.isHistoricalStatement);
    const accounts = [...new Set(history.map(b => b.accountNumber))];
    if (!accounts.length) accounts.push(null);
    return accounts.map(account => {
      const snapshot = snapshots.find(s => s.providerId === utility.providerId && s.accountNumber === account) ?? null;
      const bill = history.filter(b => b.accountNumber === account).sort((a, b) => (b.billingPeriodEnd ?? "").localeCompare(a.billingPeriodEnd ?? "") || a.id.localeCompare(b.id))[0];
      return {
        key: JSON.stringify([utility.providerId, account]), providerId: utility.providerId,
        providerName: utility.providerName, category: categories[utility.categoryId] ?? "Utility",
        accountLabel: accounts.length > 1 ? account ? `Account ending ${account.slice(-4)}` : "Account not recorded" : null,
        snapshot,
        // Existing utility intelligence is provider-scoped. Keep multi-account
        // drill-down on the exact statement until intelligence supports accounts.
        href: accounts.length > 1 && bill ? `/bill/${snapshot?.latest.id ?? bill.id}` : `/utility/${utility.providerId}`,
      };
    });
  }).sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.providerName.localeCompare(b.providerName) || a.key.localeCompare(b.key));
}
