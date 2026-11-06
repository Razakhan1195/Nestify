import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
test("monitor excludes overlapping processes and recovers automatically after an actual process crash", { timeout: 10000 }, async () => {
 const { withMonitorLock } = await import("../scripts/monitor-release.mjs");
 const dir = await mkdtemp(join(tmpdir(), "rezlee-monitor-recovery-")), file = join(dir, "state.json");
 const moduleUrl = pathToFileURL(resolve("scripts/monitor-release.mjs")).href;
 const child = spawn(process.execPath, ["--input-type=module", "-e", `import {withMonitorLock} from ${JSON.stringify(moduleUrl)};await withMonitorLock(${JSON.stringify(file)},async()=>{console.log('held');await new Promise(r=>setTimeout(r,60000));});`], { stdio: ["ignore", "pipe", "pipe"] });
 try {
  await new Promise<void>((yes, no) => { const timeout = setTimeout(() => no(Error("Lock fixture did not start")), 4000); child.stdout.on("data", b => { if (String(b).includes("held")) { clearTimeout(timeout); yes(); } }); child.once("error", no); });
  let called = false; const busy = await withMonitorLock(file, async () => { called = true; }); assert.equal(busy.skipped, true); assert.equal(called, false);
  const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
  const result = await withMonitorLock(file, async () => "recovered"); assert.equal(result, "recovered");
  await assert.rejects(withMonitorLock(file, async () => { throw Error("probe failed"); }), /probe failed/);
  assert.equal(await withMonitorLock(file, async () => "retry"), "retry");
 } finally { child.kill("SIGKILL"); await rm(dir, { recursive: true, force: true }); }
});
