import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("USD admissions fail closed, preserve failed attempts, and enforce shared and per-feature ceilings",async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;");
  await db.exec(await readFile("supabase/migrations/202610130004_ai_dollar_admission.sql","utf8"));
  const reserve=async(feature="document",model="google/gemini-2.5-flash")=>(await db.query<{v:string}>("select reserve_rezlee_ai_spend($1,$2) v",[feature,model])).rows[0].v;
  assert.equal(await reserve(),"unavailable");
  await db.exec("update rezlee_ai_spend_config set enabled=true,daily_usd_cents=300,monthly_usd_cents=400,feature_daily_usd_cents=100,feature_monthly_usd_cents=200");
  assert.equal(await reserve("document","unreviewed/model"),"unavailable");
  assert.equal(await reserve("unreviewed"),"unavailable");
  assert.equal(await reserve(),"allowed");assert.equal(await reserve(),"limited","Feature day is full");
  assert.equal(await reserve("repair"),"allowed");assert.equal(await reserve("quote"),"allowed");assert.equal(await reserve("assistant"),"limited","Overall day is full");
  assert.equal((await db.query<{v:number}>("select attempts v from rezlee_ai_spend_windows where scope='all' and kind='day'")).rows[0].v,3);
  await db.exec("update rezlee_ai_spend_config set daily_usd_cents=1000,feature_daily_usd_cents=1000");
  assert.equal(await reserve(),"allowed");assert.equal(await reserve("assistant"),"limited","Overall month is full");
  await db.exec("update rezlee_ai_spend_config set monthly_usd_cents=1000");
  assert.equal(await reserve(),"limited","Feature month is full");
  await db.exec("update rezlee_ai_spend_config set price_review_before=now()-interval '1 second'");
  assert.equal(await reserve("assistant"),"unavailable");
  await db.exec("set role authenticated");
  await assert.rejects(reserve(),/permission denied/);await assert.rejects(db.query("select * from rezlee_ai_spend_config"),/permission denied/);
  await db.exec("reset role;delete from rezlee_ai_spend_config");assert.equal(await reserve(),"unavailable");
 }finally{await db.close();}
});
