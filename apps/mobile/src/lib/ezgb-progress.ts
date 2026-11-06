export type EzgbConnectionStatus = {
  expectedUtility: string | null;
  phase: "awaiting_account" | "importing" | "different_utility" | "no_bills" | "bills_ready" | "import_failed";
  utilities: string[]; providerIds: string[]; canRetry: boolean;
};
type EzgbSyncPayload = { cancelled?: boolean; connection?: EzgbConnectionStatus; status: "idle" | "queued" | "running" | "succeeded" | "waiting" | "failed"; stats: { billsImported: number; intervalAccountsPending?: number; intervalErrors?: number; integrationsConnected?: number; errors?: number; quarantined?: number } };
/** Only a server-confirmed matching account can dismiss a new connection. */
export function ezgbConnectionConfirmed(job: EzgbSyncPayload) {
  if (job.cancelled || ["idle", "failed"].includes(job.status) || !job.connection) return false;
  return job.connection.phase === "importing" && ["queued", "running"].includes(job.status)
    || ["no_bills", "bills_ready"].includes(job.connection.phase) && ["waiting", "succeeded"].includes(job.status);
}
export function ezgbBillsAvailable(job: EzgbSyncPayload) {
  if (job.cancelled || job.status === "idle") return false;
  if (job.connection && job.connection.phase !== "bills_ready") return false;
  return ["succeeded", "waiting"].includes(job.status) && job.stats.billsImported > 0 &&
    Number(job.stats.integrationsConnected) > 0 && !job.stats.errors && !job.stats.quarantined;

}
export function ezgbProgress(job: EzgbSyncPayload) {
  if (job.cancelled || job.status === "idle") return null;
  const connection = job.connection;
  if (connection) {
    const name = connection.expectedUtility ?? connection.utilities[0] ?? "Your utility";
    const active = ["queued", "running"].includes(job.status);
    if (connection.phase === "importing") return { title: name + " is connected", detail: "Your bills are being retrieved. You can keep using Rezlee. Allow around 10 minutes; some providers take longer.", active: true, attention: false };
    if (connection.phase === "bills_ready") return { title: name + " bills are ready", detail: "This utility’s account and available bills have been saved.", active: false, attention: false };
    if (connection.phase === "no_bills") return { title: name + " is connected", detail: "The account is saved, but the utility hasn’t supplied any bills yet. Check again later without authorizing again.", active: false, attention: false };
    if (connection.phase === "different_utility") return { title: name + " hasn’t connected", detail: "The authorization returned " + connection.utilities.join(", ") + " instead. Choose " + name + " when you start a new connection, or check again if you already selected it.", active: false, attention: true };
    if (connection.phase === "import_failed") return { title: name + " needs another check", detail: "We couldn’t verify or save this connection. Your other utilities and saved bills are safe.", active: false, attention: true };
    return { title: active ? "Checking " + name : "No " + name + " account found", detail: active
      ? "We’re checking for an account already shared with Rezlee. This does not connect or authorize your utility. You can cancel this check."
      : "This check has finished. If you haven’t approved sharing, connect your utility first. If you have, check again later or remove this attempt.",
      active, attention: !active };
  }
  const partial = job.stats.billsImported > 0;
  switch (job.status) {
    case "queued": return { title: "Importing your utility bills", detail: "Your request is saved. You can keep using Rezlee.", active: true, attention: false };
    case "running": return { title: partial ? "Your bill history is arriving" : "Importing your utility bills", detail: partial ? `${job.stats.billsImported} statements saved. You can view them while the import finishes.` : "You can keep using Rezlee. Your account and insights will appear when statements are saved.", active: true, attention: false };
    case "succeeded": if (!partial) return {title:"Utility connected",detail:"Your utility hasn’t supplied any statements yet. Check again later.",active:false,attention:false}; return { title: "Utility bills ready", detail: "Your account details and available bills are ready to view.", active: false, attention: false };
    case "waiting":
      if (ezgbBillsAvailable(job)) return { title: "Your utility bills are ready", detail: "Your bill history is ready. Detailed usage insights still need verified readings.", active: false, attention: false };
      return { title: partial ? "Some bills are ready" : "Your bills aren’t ready yet", detail: partial ? "View your saved statements now. You can retry the remaining import from the connection." : "The import stopped before any statements were saved. Open the connection to try again; you don’t need to connect again.", active: false, attention: true };
    case "failed": return { title: "Your bill import didn’t finish", detail: "Try the import again from the connection. Any bills already saved are still available.", active: false, attention: true };
  }
}
