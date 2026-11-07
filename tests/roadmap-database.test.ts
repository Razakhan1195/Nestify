import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
async function fixture() {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,active boolean default true,email_confirmed_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.rezlee_account_active(p_user uuid) returns boolean language sql stable security definer as $$select coalesce((select active from auth.users where id=p_user),false)$$;
 create function public.rezlee_session_allowed() returns boolean language sql stable as $$select coalesce(current_setting('test.session_allowed',true),'true')<>'false'$$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}');`);
 await db.exec(await readFile("supabase/migrations/202611070001_customer_roadmap.sql", "utf8"));
 await db.exec(await readFile("supabase/migrations/202611070004_roadmap_session_boundaries.sql", "utf8"));
 await db.exec(await readFile("supabase/migrations/202611070005_roadmap_team_items.sql", "utf8"));
 return db;
}
async function login(db: PGlite, n: number | null, role = n ? "authenticated" : "anon") {
 await db.exec("reset role");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : ""]);
 await db.exec("set role " + role);
}
async function result<T>(db: PGlite, sql: string, args: unknown[] = []) {
 return (await db.query<{ r: T }>(sql, args)).rows[0].r;
}
const submit = (db: PGlite, n = 100, share = true) => result<string>(db,
 "select rezlee_roadmap_submit($1,'Compare monthly bills','Show what changed between two monthly bills.','bills',$2) r", [id(n), share]);
type List = { items: { id: string; myVote: number; score: number; mine: boolean; upvotes: number; downvotes: number; responseDueAt: string; createdAt: string; response: string }[]; total: number };
const list = (db: PGlite, mine = false) => result<List>(db, "select rezlee_roadmap_list($1) r", [mine]);
async function review(db: PGlite, n = 100, revision = 1, visibility = "public", status = "under_review", response = "", priority = "none") {
 await login(db, null, "service_role");
 return result<boolean>(db, "select rezlee_roadmap_review($1,$2,$3,$4,$5,$6,$7) r", [id(n), id(3), revision, visibility, status, priority, response]);
}
test("private intake, explicit sharing, seven-day deadline and identity-safe public projection", async () => {
 const db = await fixture();
 try {
  await login(db, 1); await assert.rejects(submit(db, 100, false), /Public sharing/);
  await submit(db); assert.equal(await submit(db), id(100));
  const own = await list(db, true); assert.equal(own.total, 1);
  assert.equal(Date.parse(own.items[0].responseDueAt) - Date.parse(own.items[0].createdAt), 7 * 86400000);
  await login(db, 2); assert.equal((await list(db, true)).total, 0); assert.equal((await list(db)).total, 0);
  await assert.rejects(db.query("select * from roadmap_ideas"), /permission denied/);
  await assert.rejects(db.query("select * from roadmap_votes"), /permission denied/);
  await review(db);
  await login(db, null); const publicList = await list(db); assert.equal(publicList.total, 1);
  assert.equal(JSON.stringify(publicList).includes(id(1)), false); assert.equal(publicList.items[0].mine, false);
  await assert.rejects(list(db, true), /Sign in required/);
  await assert.rejects(submit(db, 101), /permission denied/);
 } finally { await db.close(); }
});
test("one changeable vote per account, retry-safe totals, clear vote and hidden-item enforcement", async () => {
 const db = await fixture();
 try {
  await login(db, 1); await submit(db); await review(db);
  const vote = (value: number) => result<{ score: number; upvotes: number; downvotes: number; myVote: number }>(db, "select rezlee_roadmap_vote($1,$2) r", [id(100), value]);
  await login(db, 1); assert.equal((await vote(1)).score, 1); assert.equal((await vote(1)).score, 1);
  assert.equal((await vote(-1)).score, -1);
  await login(db, 2); assert.equal((await vote(1)).score, 0);
  assert.deepEqual((await list(db)).items.map(x => [x.upvotes, x.downvotes, x.myVote]), [[1, 1, 1]]);
  assert.equal((await vote(0)).score, -1); assert.equal((await vote(0)).score, -1);
  await assert.rejects(vote(2), /Check vote/);
  await review(db, 100, 2, "hidden", "not_planned", "This duplicates an existing feature.", "none");
  await login(db, 2); await assert.rejects(vote(1), /unavailable/); assert.equal((await list(db)).total, 0);
  await login(db, 1); assert.equal((await list(db, true)).items[0].response, "This duplicates an existing feature.");
 } finally { await db.close(); }
});
test("admin decisions require explanation and priority, detect stale updates, and cannot be forged by customers", async () => {
 const db = await fixture();
 try {
  await login(db, 1); await submit(db);
  await assert.rejects(result(db, "select rezlee_roadmap_review($1,$2,1,'public','shipped','none','Already done') r", [id(100), id(1)]), /permission denied/);
  await assert.rejects(review(db, 100, 1, "public", "planned", "We will consider this next.", "none"), /clear decision/);
  await assert.rejects(review(db, 100, 1, "public", "not_planned", ""), /clear decision/);
  assert.equal(await review(db, 100, 1, "public", "planned", "We plan to add this after the current release.", "next"), true);
  assert.equal(await review(db, 100, 1, "public", "shipped", "This is now available to everyone."), false);
  await login(db, null, "service_role");
  const row = (await db.query<{ decided_at: string; revision: number }>("select decided_at,revision from roadmap_ideas")).rows[0];
  assert.ok(row.decided_at); assert.equal(row.revision, 2);
  assert.equal((await db.query("select * from roadmap_review_events")).rows.length, 1);
  await review(db,100,2,"public","shipped","This is now available to everyone.","next");
  assert.equal((await db.query<{priority:string}>("select priority from roadmap_ideas")).rows[0].priority,"none");
 } finally { await db.close(); }
});
test("rate limits, conflicting retries, inactive accounts, filters and account deletion preserve boundaries", async () => {
 const db = await fixture();
 try {
  await login(db, 1);
  for (let n = 100; n < 105; n++) await submit(db, n);
  assert.equal(await submit(db, 100), id(100));
  await assert.rejects(submit(db, 105), /Daily suggestion limit/);
  await assert.rejects(result(db, "select rezlee_roadmap_submit($1,'Another title','A different detailed suggestion here.','care',true) r", [id(100)]), /Submission changed/);
  await assert.rejects(result(db, "select rezlee_roadmap_list(false,'invalid') r"), /Check filters/);
  await db.exec("reset role"); await db.query("update auth.users set active=false where id=$1", [id(1)]);
  await login(db, 1); await assert.rejects(submit(db, 100), /Sign in required/);
  await db.exec("reset role"); await db.query("delete from auth.users where id=$1", [id(1)]);
  assert.equal((await db.query("select * from roadmap_ideas")).rows.length, 0);
 } finally { await db.close(); }
});

test("revoked sessions, unverified users and deleting idea owners cannot bypass the API through RPC", async () => {
 const db=await fixture();
 try {
  await login(db,1);await submit(db);await review(db);
  await login(db,2);await db.exec("set test.session_allowed='false'");
  await assert.rejects(submit(db,101),/Sign in required/);
  await assert.rejects(result(db,"select rezlee_roadmap_vote($1,1) r",[id(100)]),/Sign in required/);
  await assert.rejects(list(db,true),/Sign in required/);
  assert.equal((await list(db)).items[0].mine,false);
  await db.exec("reset role;set test.session_allowed='true'");
  await db.query("update auth.users set email_confirmed_at=null where id=$1",[id(2)]);
  await login(db,2);await assert.rejects(submit(db,101),/Sign in required/);
  await db.exec("reset role");await db.query("update auth.users set email_confirmed_at=now() where id=$1",[id(2)]);
  await db.query("update auth.users set active=false where id=$1",[id(1)]);
  await login(db,2);assert.equal((await list(db)).total,0);
  await assert.rejects(result(db,"select rezlee_roadmap_vote($1,1) r",[id(100)]),/unavailable/);
 } finally {await db.close();}
});

test("team-owned ideas are visible and votable without becoming customer-owned or bypassing moderation", async () => {
 const db=await fixture();
 try {
  await db.query("insert into roadmap_ideas(id,user_id,title,description,category,visibility) values($1,null,'Shared household budgets','Set monthly household spending targets together.','household','public')",[id(200)]);
  await login(db,1);const board=await list(db);assert.equal(board.total,1);assert.equal(board.items[0].mine,false);assert.equal((await list(db,true)).total,0);
  assert.equal((await result<{score:number}>(db,"select rezlee_roadmap_vote($1,1) r",[id(200)])).score,1);
  assert.equal((await result<{score:number}>(db,"select rezlee_roadmap_vote($1,0) r",[id(200)])).score,0);
  await assert.rejects(db.query("insert into roadmap_ideas(id,user_id,title,description,category) values($1,null,'Fake team idea','A customer cannot impersonate the team.','other')",[id(201)]),/permission denied/);
  await db.exec("reset role");await db.query("update roadmap_ideas set visibility='hidden' where id=$1",[id(200)]);
  await login(db,1);assert.equal((await list(db)).total,0);await assert.rejects(result(db,"select rezlee_roadmap_vote($1,1) r",[id(200)]),/unavailable/);
 }finally{await db.close();}
});
