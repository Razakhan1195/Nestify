/** Kept behind the deployment gate until the additive migration is verified. */
export const billRecordsEnabled = () => process.env.REZLEE_BILL_RECORD_REVIEW === "true";
export const effectiveBillTable = () => billRecordsEnabled() ? "rezlee_effective_bills" : "bills";
