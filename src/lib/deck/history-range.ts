/** Customer-selected calendar range. Billing frequency never determines expected count. */
export function historyMonths(value: unknown = 12): number {
 if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 12) throw Error("Choose between 1 and 12 months.");
 return value;
}
export function historyRange(months = 6, now = new Date()) {
 historyMonths(months);
 const until = new Date(now.toISOString().slice(0,10) + "T00:00:00Z");
 const since = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth()-months, 1));
 since.setUTCDate(Math.min(until.getUTCDate(),new Date(Date.UTC(since.getUTCFullYear(),since.getUTCMonth()+1,0)).getUTCDate()));
 return {since_date:since.toISOString().slice(0,10),until_date:until.toISOString().slice(0,10)};
}
