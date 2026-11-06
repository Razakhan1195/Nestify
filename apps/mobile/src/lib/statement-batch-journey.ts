import type { StatementBatch, StatementBatchItem } from "./statement-batch-core";

const completed = (item: StatementBatchItem) => (item.status === "saved" || item.status === "duplicate") && Boolean(item.billId);
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
export type BatchAccountResult = {
  key: string; provider: string; nickname: string; category: string;
  billId: string; statementCount: number; newCount: number; existingCount: number;
};

// This is a receipt for this batch, not a count of every account or period in Bills.
// Only explicit saved/duplicate results with a server bill ID can enter it.
export function batchAccountResults(batch: StatementBatch): BatchAccountResult[] {
  const groups = new Map<string, BatchAccountResult & { latest: string }>();
  const seen = new Set<string>();
  // Prefer the saved result when another file in this batch duplicates it.
  for (const item of [...batch.items].sort((a, b) => Number(b.status === "saved") - Number(a.status === "saved"))) {
    if (!completed(item) || seen.has(item.billId!)) continue;
    seen.add(item.billId!);
    const f = item.fields;
    const identified = Boolean(f.provider_name.trim() && f.account_number.trim() && f.category.trim());
    const key = identified ? JSON.stringify([normalize(f.provider_name), normalize(f.category), normalize(f.account_number)]) : item.billId!;
    const group = groups.get(key) ?? {
      key, provider: f.provider_name.trim() || "Saved statement", nickname: f.account_number.trim() || "Account not identified",
      category: f.category.trim(), billId: item.billId!, statementCount: 0, newCount: 0, existingCount: 0, latest: "",
    };
    group.statementCount++;
    if (item.status === "saved") group.newCount++; else group.existingCount++;
    if (f.billing_period_end > group.latest || (f.billing_period_end === group.latest && item.billId! < group.billId)) {
      group.latest = f.billing_period_end; group.billId = item.billId!;
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.nickname.localeCompare(b.nickname) || a.key.localeCompare(b.key))
    .map(group => ({ key: group.key, provider: group.provider, nickname: group.nickname, category: group.category, billId: group.billId, statementCount: group.statementCount, newCount: group.newCount, existingCount: group.existingCount }));
}

export function nextBatchItem(batch: StatementBatch): StatementBatchItem | null {
  // Resolve uncertain submissions before starting a different upload.
  return batch.items.find(i => ["submitting", "needs_file", "blocked"].includes(i.status))
    ?? batch.items.find(i => i.status === "review") ?? null;
}

export function batchResultDestination(result: BatchAccountResult) {
  // Batch size says nothing about the history already saved for this account.
  return { pathname: "/bill/history-insights" as const, params: { billId: result.billId } };
}
