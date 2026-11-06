import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {feedbackDueDate,torontoDate} from "../src/lib/feedback/deadline";
test("feedback deadlines respect Toronto dates, weekends and DST",()=>{
 assert.equal(feedbackDueDate("2026-10-23T23:00:00Z"),"2026-10-28");
 assert.equal(feedbackDueDate("2026-10-24T02:00:00Z"),"2026-10-28");
 assert.equal(feedbackDueDate("2026-10-25T15:00:00Z"),"2026-10-28");
 assert.equal(feedbackDueDate("2026-10-30T15:00:00Z"),"2026-11-04");
 assert.equal(torontoDate(new Date("2026-11-02T04:30:00Z")),"2026-11-01");
});
test("private follow-ups enforce revision, audit, real response details and customer isolation",async()=>{
 const db=new PGlite();const id="11111111-1111-4111-8111-111111111111",operator="22222222-2222-4222-8222-222222222222";
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.customer_feedback(id uuid primary key);grant usage on schema public,auth to authenticated,service_role;insert into auth.users values('${operator}');insert into customer_feedback values('${id}');`);
 await db.exec(await readFile("supabase/migrations/202610230002_feedback_followup.sql","utf8"));
 const save=async(revision:number,decision="We will investigate and report back.",channel="",responded:string|null=null)=>(await db.query<{ok:boolean}>("select record_rezlee_feedback_followup($1,$2,$3,'Raza',$4,$5,$6) ok",[id,operator,revision,decision,channel,responded])).rows[0].ok;
 await db.exec("set role service_role");assert.equal(await save(0),true);assert.equal(await save(0),false);
 await assert.rejects(save(1,"","email",new Date().toISOString()));
 await assert.rejects(save(1,"Decision","email","2099-01-01"));
 assert.equal(await save(1,"We will make this change.","email","2026-01-01"),true);
 assert.equal((await db.query("select * from customer_feedback_followup_events")).rows.length,2);
 await db.exec("reset role;set role authenticated");
 await assert.rejects(db.query("select * from customer_feedback_followup"));
 await assert.rejects(db.query("select * from customer_feedback_followup_events"));
 await assert.rejects(save(2));
 await db.exec(`reset role;delete from customer_feedback where id='${id}'`);
 assert.equal((await db.query("select * from customer_feedback_followup")).rows.length,0);
 assert.equal((await db.query("select * from customer_feedback_followup_events")).rows.length,0);
 }finally{await db.close();}
});
