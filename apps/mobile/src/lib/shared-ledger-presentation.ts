import type { SharedEntry, SharedPayload, SharedPerson } from "./shared-expense-types";

// Self-only, removed and zero-share entries do not establish sharing adoption.
// A paginated page cannot establish that sharing has never happened.
export function sharedLedgerStage(data: Pick<SharedPayload, "entries" | "balances" | "nextCursor">): "start" | "active" | "settled" | "history" {
  if (data.balances.some(balance => balance.cents > 0)) return "active";
  const shared = data.entries.some(entry => {
    if (entry.voided) return false;
    if (entry.kind === "repayment") return entry.details.amountCents > 0 && entry.details.from !== entry.details.to;
    const participants = new Set([entry.details.paidBy, ...entry.details.shares.filter(share => share.cents > 0).map(share => share.personId)]);
    return entry.details.amountCents > 0 && participants.size > 1;
  });
  if (shared) return "settled";
  return data.nextCursor ? "history" : "start";
}

export function sharedEntryContext(entry: SharedEntry, people: SharedPerson[], money: (cents: number) => string) {
  const name = (id: string) => {
    const person = people.find(value => value.id === id);
    return person?.self ? "You" : person?.name ?? "Former household member";
  };
  if (entry.kind === "repayment") return name(entry.details.from) + " → " + name(entry.details.to);
  const { paidBy, shares } = entry.details;
  const positive = shares.filter(share => share.cents > 0);
  const names = positive.map(share => name(share.personId));
  const assigned = names.length > 2 ? names.slice(0, 2).join(", ") + " + " + (names.length - 2) + " more" : names.join(" & ");
  const self = people.find(person => person.self)?.id;
  const own = shares.find(share => share.personId === self);
  const onlyPayer = positive.length === 1 && positive[0].personId === paidBy;
  return "Paid by " + name(paidBy) + " · " + (onlyPayer ? "Assigned to " + (paidBy === self ? "you" : name(paidBy)) + " only" : "For " + (assigned || "no allocated shares"))
    + (!onlyPayer && own && own.cents > 0 ? " · Your share " + money(own.cents) : "");
}
