import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
test("12 month migration preserves existing consent and rejects out-of-range requests",async()=>{
 const db=new PGlite();try {
 await db.exec("create table deck_hosted_auth_intents(id integer primary key,history_months integer not null default 6 check(history_months between 1 and 6)); insert into deck_hosted_auth_intents(id) values(1);");
 await db.exec(await readFile("supabase/migrations/202610230001_deck_twelve_month_history.sql","utf8"));
 await db.exec("insert into deck_hosted_auth_intents(id) values(2)");
 const rows=(await db.query<{history_months:number}>("select history_months from deck_hosted_auth_intents order by id")).rows;
 assert.deepEqual(rows.map(r=>r.history_months),[6,12]);
 await assert.rejects(db.exec("insert into deck_hosted_auth_intents values(3,13)"));
 }finally{await db.close();}
});
