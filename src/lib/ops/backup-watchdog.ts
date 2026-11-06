import { z } from "zod";
const base = "https://api.github.com/repos/Razakhan1195/rezlee-recovery";
const artifactsSchema = z.object({ artifacts: z.array(z.object({ id:z.number().int(), name:z.string(), expired:z.boolean(), size_in_bytes:z.number().nonnegative(), created_at:z.string().datetime() })) });
const runsSchema = z.object({ workflow_runs:z.array(z.object({ status:z.string() })) });
export async function checkRecoveryBackup({ token, now = Date.now(), request = fetch }: { token:string; now?:number; request?:typeof fetch }) {
  if (!token.trim()) throw Error("Backup dispatch credential unavailable");
  async function github(path:string, body?:unknown) {
    const result = await request(base+path,{ method:body ? "POST":"GET", headers:{ Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json", "Content-Type":"application/json", "X-GitHub-Api-Version":"2022-11-28" }, cache:"no-store", redirect:"error", signal:AbortSignal.timeout(10000), ...(body ? {body:JSON.stringify(body)} : {}) });
    if (!result.ok) throw Error("Backup service unavailable");
    return result.status === 204 ? null : result.json();
  }
  const { artifacts } = artifactsSchema.parse(await github("/actions/artifacts?per_page=100"));
  const latest = artifacts.filter(a=>a.name.startsWith("rezlee-recovery-")&&!a.expired&&a.size_in_bytes>0).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
  const ageHours = latest ? (now-Date.parse(latest.created_at))/3600000 : null;
  if (ageHours !== null && ageHours < -5/60) throw Error("Backup clock mismatch");
  if (ageHours !== null && ageHours < 20) return { action:"fresh_backup" as const, ageHours };
  const { workflow_runs } = runsSchema.parse(await github("/actions/workflows/backup.yml/runs?per_page=20"));
  if (workflow_runs.some(r=>["queued","in_progress","waiting","requested","pending"].includes(r.status))) return { action:"already_running" as const, ageHours };
  await github("/actions/workflows/backup.yml/dispatches",{ref:"main",inputs:{respect_freshness:true}});
  return { action:"dispatched" as const, ageHours };
}
