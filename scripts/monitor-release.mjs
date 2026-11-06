import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function nextMonitorState(previous, healthy) {
  const failures = healthy ? 0 : Math.min(100, (Number(previous?.failures) || 0) + 1);
  const incident = !healthy && (previous?.incident === true || failures >= 3);
  const transition = incident && !previous?.incident ? "incident" : healthy && previous?.incident ? "recovered" : null;
  return { failures, incident, transition };
}
export async function checkRelease({ url, token, webhook, previous = {}, fetchImpl = fetch }) {
  if (!/^https:\/\/[^/]+\/api\/ops\/health$/.test(url) || !token || token.length < 32) throw Error("Monitoring configuration is incomplete.");
  if (webhook && new URL(webhook).protocol !== "https:") throw Error("Alert receiver must use HTTPS.");
  let healthy = false;
  try {
    const response = await fetchImpl(url, { headers: { Authorization: "Bearer " + token }, redirect: "error", signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    healthy = response.status === 200 && body.healthy === true && Array.isArray(body.signals) && body.signals.length > 0 && body.signals.every(s => s.state === "ok");
  } catch { /* Timeouts and unavailable/unauthorized probes count as failed checks. */ }
  const next = nextMonitorState(previous, healthy);
  if (next.transition) {
    if (!webhook) throw Error("Alert delivery is not configured; retain the previous incident state.");
    // Only fixed operational text is sent. Never forward a response body or raw exception.
    const response = await fetchImpl(webhook, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: next.transition === "incident" ? "Rezlee service checks failed three times. Open the operations console and review the release runbook." : "Rezlee service checks have recovered. Review the incident before closing it." }),
      redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error("Alert receiver did not accept the event; retain the previous incident state.");
  }
  return { failures: next.failures, incident: next.incident, checkedAt: new Date().toISOString(), healthy };
}
/** A kernel-backed SQLite write lock is released when a process dies; no stale lockfile can silence monitoring. Node 24+ on local disk. */
export async function withMonitorLock(file, work) {
  const sqlite = await import("node:sqlite");
  const Database = sqlite.DatabaseSync ?? sqlite.Database;
  const lockPath = file + ".lease.sqlite";
  const handle = await fs.open(lockPath, "a", 0o600); await handle.close(); await fs.chmod(lockPath, 0o600);
  const db = new Database(lockPath, { timeout: 0 });
  let locked = false;
  try {
    try { db.exec("BEGIN IMMEDIATE"); locked = true; }
    catch (error) { if (error.errcode === 5 || error.code === "SQLITE_BUSY") return { skipped: true, reason: "check_in_progress" }; throw error; }
    return await work();
  } finally { if (locked) db.exec("ROLLBACK"); db.close(); }
}
export async function main(env = process.env) {
  const file = env.REZLEE_MONITOR_STATE_FILE;
  if (!file || !path.isAbsolute(file)) throw Error("An absolute private monitor state path is required.");
  const result = await withMonitorLock(file, async () => {
    let previous = {};
    try { previous = JSON.parse(await fs.readFile(file, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw Error("Monitor state is unreadable."); }
    const next = await checkRelease({ url: env.REZLEE_MONITOR_URL, token: env.REZLEE_MONITOR_TOKEN, webhook: env.REZLEE_ALERT_WEBHOOK_URL, previous });
    const temporary = file + ".next";
    const handle = await fs.open(temporary, "w", 0o600);
    try { await handle.chmod(0o600); await handle.writeFile(JSON.stringify(next)); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, file);
    return next;
  });
  console.log(JSON.stringify(result));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Release monitoring failed. Check configuration or the private state lock; no raw service response was logged."); process.exitCode = 1; });
}
