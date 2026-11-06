import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

test("attention bulk dismissal preserves records, account boundaries, new arrivals, and reversible decisions", async () => {
  const work = await mkdtemp(join(tmpdir(), "rezlee-attention-"));
  try {
    const fixture = `export const state={user:'owner',home:'home-a',fail:null,rows:{},writes:[]};
    export const client={from(table){let filters=[],mode='read',values=null;const q={
      select(){return q},eq(k,v){filters.push([k,v]);return q},neq(){return q},order(){return q},limit(){return q},
      in(k,v){filters.push([k,v]);return q},update(v){mode='update';values=v;return q},upsert(v){mode='upsert';values=v;return q},
      then(ok,bad){try{if(state.fail===table)return Promise.resolve({data:null,error:{message:'private database failure'}}).then(ok,bad);
      let rows=(state.rows[table]||[]).filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v));
      if(mode==='upsert'){state.writes.push({table,mode,values});for(const value of values){const existing=(state.rows[table]||[]).find(r=>r.user_id===value.user_id&&r.home_id===value.home_id&&r.attention_key===value.attention_key);if(existing)Object.assign(existing,value);else(state.rows[table]??=[]).push({...value})}rows=values}
      if(mode==='update'){state.writes.push({table,mode,values,filters});for(const row of rows)Object.assign(row,values)}
      return Promise.resolve({data:rows,error:null}).then(ok,bad)}catch(error){return Promise.reject(error).then(ok,bad)}}};return q}};`;
    const stubs: Record<string,string> = {
      fixture,
      "@/lib/supabase/mobile": 'import{state,client}from"fixture";export const authenticateMobileRequest=async()=>state.user?{user:{id:state.user},supabase:client,error:null}:{error:{message:"Not signed in",status:401}};',
      "@/lib/household/access": 'import{state}from"fixture";export const resolveAccessibleHome=async()=>({data:{home:{id:state.home},role:"owner"},error:null});',
      "@/lib/product/bill-records": 'export const effectiveBillTable=()=>"bills";',
      "next/server": 'export const NextResponse={json:(data,options)=>Response.json(data,options)};',
    };
    const output=join(work,"route.cjs");
    await build({stdin:{contents:`export{GET,POST}from ${JSON.stringify(resolve("src/app/api/mobile/v1/needs-you/route.ts"))};export{state}from"fixture";`,loader:"ts",resolveDir:process.cwd()},bundle:true,platform:"node",format:"cjs",outfile:output,alias:{"@":resolve("src")},plugins:[{name:"fixture",setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"fixture"}:undefined);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"ts"}));}}]});
    type Row=Record<string,unknown>;
    const h=createRequire(import.meta.url)(output) as { GET:(r:Request)=>Promise<Response>;POST:(r:Request)=>Promise<Response>;state:{user:string|null;home:string;fail:string|null;rows:Record<string,Row[]>;writes:{table:string;mode:string;values:unknown}[]} };
    const bill=(id:string,user="owner")=>({id,user_id:user,home_id:"home-a",name:"Internet",amount:90,currency:"CAD",due_date:"2020-01-01",status:"unpaid",created_at:"2020-01-01",providers:null,raw_data:{category:"internet"}});
    h.state.rows.bills=[bill("bill-a"),bill("bill-b"),bill("private-bill","another-user")];
    const post=(body:unknown)=>h.POST(new Request("https://rezlee.test/api/mobile/v1/needs-you",{method:"POST",body:JSON.stringify(body)}));
    let result=await post({action:"dismiss",homeId:"home-a",keys:["overdue-bill-bill-a","overdue-bill-private-bill","made-up"]});
    assert.equal(result.status,200);const receipt=await result.json();assert.deepEqual(receipt.keys,["overdue-bill-bill-a"]);
    assert.equal(h.state.rows.bills[0].status,"unpaid","Dismiss must never claim payment");
    assert.equal(h.state.rows.attention_resolutions.length,1);assert.equal(h.state.rows.attention_resolutions[0].user_id,"owner");
    let list=await(await h.GET(new Request("https://rezlee.test"))).json();assert.equal(list.count,1,"Unselected/new attention remains");
    assert.equal(h.state.writes.every(w=>w.table==="attention_resolutions"),true);
    result=await post({action:"restore",homeId:"home-a",keys:receipt.keys,dismissedAt:"2000-01-01T00:00:00.000Z"});assert.deepEqual((await result.json()).keys,[],"Stale undo cannot reverse another decision");
    result=await post({action:"restore",homeId:"home-a",...receipt});assert.equal(result.status,200);assert.deepEqual((await result.json()).keys,receipt.keys);
    list=await(await h.GET(new Request("https://rezlee.test"))).json();assert.equal(list.count,2);
    const before=h.state.writes.length;h.state.fail="documents";
    result=await post({action:"dismiss",homeId:"home-a",keys:["overdue-bill-bill-a"]});assert.equal(result.status,503);assert.equal(h.state.writes.length,before);assert.doesNotMatch(await result.text(),/private database/);
    assert.equal((await h.GET(new Request("https://rezlee.test"))).status,503,"A partial read cannot look caught-up");
    h.state.fail=null;h.state.home="home-b";assert.equal((await post({action:"dismiss",homeId:"home-a",keys:["overdue-bill-bill-a"]})).status,409);
    h.state.home="home-a";h.state.user="another-user";
    result=await post({action:"dismiss",homeId:"home-a",keys:["overdue-bill-bill-b"]});assert.deepEqual((await result.json()).keys,[],"Cannot dismiss another user's records");
    assert.equal((await post({action:"dismiss",homeId:"home-a",keys:Array(501).fill("x")})).status,400);
    h.state.user=null;assert.equal((await post({action:"dismiss",homeId:"home-a",keys:["x"]})).status,401);
  } finally { await rm(work,{recursive:true,force:true}); }
});
