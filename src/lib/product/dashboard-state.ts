export type DashboardState = "EMPTY" | "EARLY" | "ACTIVE" | "ATTENTION" | "STABLE";

type DashboardStateInput = {
  billsCount: number;
  careCount: number;
  meaningfulActivityCount: number;
  meaningfulChangesCount: number;
  openAttentionCount: number;
  providersCount: number;
  upcomingDueItemsCount: number;
  vaultRecordsCount: number;
};

export function getDashboardState({
  billsCount,
  careCount,
  meaningfulActivityCount,
  meaningfulChangesCount,
  openAttentionCount,
  providersCount,
  upcomingDueItemsCount,
  vaultRecordsCount,
}: DashboardStateInput): DashboardState {
  if (openAttentionCount > 0) return "ATTENTION";

  const setupSignalCount = billsCount + careCount + providersCount + vaultRecordsCount;
  const operatingSignalCount =
    setupSignalCount + meaningfulActivityCount + meaningfulChangesCount + upcomingDueItemsCount;

  if (operatingSignalCount === 0) return "EMPTY";
  if (setupSignalCount <= 2 && meaningfulChangesCount === 0) return "EARLY";
  if (meaningfulChangesCount > 0 || upcomingDueItemsCount > 0 || meaningfulActivityCount > 0) {
    return "ACTIVE";
  }

  return "STABLE";
}
