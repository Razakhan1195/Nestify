import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimDeckVerification, deckChallengeId, updateClaimedVerification } from "../src/lib/deck/verification";

const run = { id: "run-1", status: "requires_user_action", updated_at: "2026-09-26T00:00:00.000Z", interaction: { fields: [{name:"code", type:"text"}] } };

test("challenge identities change with task, question or revision, and exclude terminal runs", () => {
  const token = deckChallengeId(run);
  assert.match(token!, /^[a-f0-9]{64}$/);
  assert.equal(deckChallengeId({...run}), token);
  for (const next of [{...run,id:"run-2"},{...run,updated_at:"2026-09-26T00:01:00Z"},{...run,interaction:{fields:[{name:"question"}]}}]) assert.notEqual(deckChallengeId(next),token);
  for (const status of ["running","failed","success","queued"]) assert.equal(deckChallengeId({...run,status}),null);
  assert.equal(deckChallengeId({...run,updated_at:"invalid"}),null);
});

// Exercise the adapter's actual filters as SQL against Postgres, with no Deck/network calls.
async function fixture() {
  const db = new PGlite();
  await db.exec(`create table provider_sync_runs(id text primary key, user_id text, status text, updated_at text, interaction jsonb, metadata jsonb, message text);
    create function bump_version() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp()::text; return new; end $$;
    create trigger version before update on provider_sync_runs for each row execute function bump_version();`);
  await db.query("insert into provider_sync_runs(id,user_id,status,updated_at,interaction) values($1,$2,$3,$4,$5)", [run.id,"owner",run.status,run.updated_at,JSON.stringify(run.interaction)]);
  let writes = 0;
  const supabase = { from(table:string) {
    assert.equal(table,"provider_sync_runs");
    return { update(patch:Record<string,unknown>) {
      const filters:Array<[string,unknown]>=[];
      const builder = {
        eq(key:string,value:unknown) { filters.push([key,value]);return builder; },
        select() { return builder; },
        async maybeSingle() {
          writes++;
          const entries=Object.entries(patch).filter(([,v])=>v!==undefined);
          const params=entries.map(([k,v])=>["interaction","metadata"].includes(k)&&v!==null?JSON.stringify(v):v);
          const set=entries.map(([k],i)=>`"${k}"=$${i+1}`).join(",");
          const where=filters.map(([k,v])=>{params.push(v);return `"${k}"=$${params.length}`;}).join(" and ");
          const result=await db.query(`update provider_sync_runs set ${set} where ${where} returning id,updated_at`,params);
          return {data:result.rows[0]??null,error:null};
        }
      };return builder;
    }};
  }} as unknown as SupabaseClient;
  return {db,supabase,writes:()=>writes};
}

test("concurrent verification submissions have one winner; repeat and stale answers are blocked", async()=>{
 const f=await fixture();
 try {
  const input={supabase:f.supabase,userId:"owner",run,challengeId:deckChallengeId(run)!,metadata:{}};
  const results=await Promise.allSettled([claimDeckVerification(input),claimDeckVerification(input)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.filter(r=>r.status==="rejected").length,1);
  await assert.rejects(claimDeckVerification(input),/changed or was already submitted/);
  const row=(await f.db.query<{status:string;interaction:unknown}>("select status,interaction from provider_sync_runs")).rows[0];
  assert.equal(row.status,"running");assert.equal(row.interaction,null);
 } finally {await f.db.close();}
});

test("wrong household owner and old challenge cannot consume verification; older clients remain compatible",async()=>{
 const f=await fixture();
 try{
  await assert.rejects(claimDeckVerification({supabase:f.supabase,userId:"other",run,metadata:{}}),/changed/);
  const writes=f.writes();
  await assert.rejects(claimDeckVerification({supabase:f.supabase,userId:"owner",run,challengeId:"a".repeat(64),metadata:{}}),/changed/);
  assert.equal(f.writes(),writes);
  const claim=await claimDeckVerification({supabase:f.supabase,userId:"owner",run,metadata:{}});
  assert.equal(claim.challengeId,deckChallengeId(run));
  assert.equal(await updateClaimedVerification({supabase:f.supabase,userId:"owner",runId:run.id,version:claim.version,patch:{status:"requires_user_action",interaction:run.interaction}}),true);
 }finally{await f.db.close();}
});

test("a delayed submission response cannot restore a prompt over a newer webhook result",async()=>{
 const f=await fixture();
 try{
  const claim=await claimDeckVerification({supabase:f.supabase,userId:"owner",run,metadata:{}});
  await f.db.query("update provider_sync_runs set status='success',interaction=null where id=$1",[run.id]);
  assert.equal(await updateClaimedVerification({supabase:f.supabase,userId:"owner",runId:run.id,version:claim.version,patch:{status:"requires_user_action",interaction:run.interaction}}),false);
  assert.equal((await f.db.query<{status:string}>("select status from provider_sync_runs")).rows[0].status,"success");
 }finally{await f.db.close();}
});

test("database failure fails closed before any verification can be sent",async()=>{
 const q={eq:()=>q,select:()=>q,maybeSingle:async()=>({data:null,error:{message:"private database error"}})};
 const supabase={from:()=>({update:()=>q})} as unknown as SupabaseClient;
 await assert.rejects(claimDeckVerification({supabase,userId:"owner",run,metadata:{}}),e=>e instanceof Error && !e.message.includes("private") && /Could not submit/.test(e.message));
});
