import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
test("production cron resumes pending imports only behind separate worker and cron authentication",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"rezlee-deck-recovery-"));
 const old={cron:process.env.CRON_SECRET,worker:process.env.DECK_IMPORT_WORKER_SECRET,enabled:process.env.REZLEE_DECK_TELECOM_ENABLED};
 try{
  const fixture=join(dir,"fixture.mjs");
  await writeFile(fixture,'export const queue=[];export const calls=[];export function after(fn){queue.push(fn)};export async function recoverHostedAuth(){calls.push("hosted")};export async function recoverTelecomImports(){calls.push("imports")};');
  const out=join(dir,"route.mjs");
  await build({entryPoints:[resolve("src/app/api/deck/recover-imports/route.ts")],outfile:out,bundle:true,platform:"node",format:"esm",plugins:[{name:"recovery-boundaries",setup(b){b.onResolve({filter:/^(next\/server|@\/lib\/deck\/hosted-auth|@\/lib\/sync\/deck-telecom-runtime)$/},()=>({path:fixture,external:true}));}}]});
  const route=await import(pathToFileURL(out).href);const f=await import(pathToFileURL(fixture).href);
  process.env.CRON_SECRET="cron-fixture";process.env.DECK_IMPORT_WORKER_SECRET="worker-fixture";process.env.REZLEE_DECK_TELECOM_ENABLED="true";
  const req=(token?:string)=>new Request("https://rezlee.com/api/deck/recover-imports",{headers:token?{authorization:"Bearer "+token}:{}});
  assert.equal((await route.GET(req())).status,401);assert.equal((await route.GET(req("worker-fixture"))).status,401);
  assert.equal((await route.POST(req("cron-fixture"))).status,401);assert.equal(f.queue.length,0);
  assert.equal((await route.GET(req("cron-fixture"))).status,202);assert.equal(f.queue.length,1);
  await f.queue.shift()();assert.deepEqual(f.calls,["hosted","imports"]);
  process.env.REZLEE_DECK_TELECOM_ENABLED="false";assert.equal((await route.POST(req("worker-fixture"))).status,200);assert.equal(f.queue.length,0);
 }finally{
  for(const [key,value] of Object.entries({CRON_SECRET:old.cron,DECK_IMPORT_WORKER_SECRET:old.worker,REZLEE_DECK_TELECOM_ENABLED:old.enabled}))if(value===undefined)delete process.env[key];else process.env[key]=value;
  await rm(dir,{recursive:true,force:true});
 }
});
