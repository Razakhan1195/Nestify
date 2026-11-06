import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canCompleteCareTask } from "../src/lib/product/care-access";
import { completeMaintenanceTaskForUser } from "../src/lib/product/maintenance-mutations";

test("Care completion affordances follow owner, assignment and completed states", () => {
  assert.equal(canCompleteCareTask("owner",null,{status:"open",assigned_member_id:"other"}),true);
  assert.equal(canCompleteCareTask("member","me",{status:"open",assigned_member_id:"me"}),true);
  assert.equal(canCompleteCareTask("member","me",{status:"open",assigned_member_id:null}),true);
  assert.equal(canCompleteCareTask("member","me",{status:"open",assigned_member_id:"other"}),false);
  assert.equal(canCompleteCareTask("member",null,{status:"open",assigned_member_id:"other"}),false);
  assert.equal(canCompleteCareTask("owner",null,{status:"completed"}),false);
});
function context(data: unknown, error: unknown = null) {
  const writes: string[]=[];
  const supabase={rpc:async()=>({data,error}),from:(table:string)=>({insert:async()=>{writes.push(table);return {error:null};},upsert:async()=>{writes.push(table);return {error:null};}})} as unknown as SupabaseClient;
  return {value:{homeId:"home",userId:"user",supabase},writes};
}
test("replayed completion succeeds without another timeline or attention event",async()=>{
  const ctx=context({completed:false});
  const result=await completeMaintenanceTaskForUser(ctx.value,{taskId:"task",attentionKey:"care:task"});
  assert.deepEqual(result,{ok:true,id:"task",alreadyCompleted:true});assert.deepEqual(ctx.writes,[]);
});
test("first completion reports the database next date and writes one timeline event",async()=>{
  const ctx=context({completed:true,next_date:"2026-10-03"});
  const result=await completeMaintenanceTaskForUser(ctx.value,{taskId:"task"});
  assert.deepEqual(result,{ok:true,id:"task",nextDate:"2026-10-03"});assert.deepEqual(ctx.writes,["timeline_events"]);
});
test("missing or failed completion never invents success or recurrence",async()=>{
  for(const ctx of [context(null),context({},null),context(null,{code:"42501"})]){
    const result=await completeMaintenanceTaskForUser(ctx.value,{taskId:"task"});assert.equal(result.ok,false);assert.deepEqual(ctx.writes,[]);
  }
});
