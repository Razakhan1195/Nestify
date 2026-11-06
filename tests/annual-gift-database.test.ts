import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
const id=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz,active boolean default true);
 create table public.homes(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now());
 create table public.household_members(id uuid primary key,home_id uuid,linked_user_id uuid,status text,created_at timestamptz default now());
 create table public.provider_registry(id uuid primary key);
 create table public.rezlee_waitlist(id uuid primary key default gen_random_uuid(),email text,slot integer,created_at timestamptz default now(),status text);
 create function public.guard_deleting_rezlee_account() returns trigger language plpgsql as $$begin return new;end$$;
 create function public.rezlee_account_active(p_user uuid) returns boolean language sql as $$select coalesce((select active from auth.users where id=p_user),false)$$;
 `);
 await db.exec(await readFile("supabase/migrations/202610160001_memberships_and_support.sql","utf8"));
 await db.exec(await readFile("supabase/migrations/202610160002_store_sync.sql","utf8"));
 await db.exec("create function public.rezlee_waitlist_limit(text,integer,integer) returns boolean language sql as $$select true$$;");
 await db.exec(await readFile("supabase/migrations/202610160003_waitlist_claims.sql","utf8"));
 await db.exec(await readFile("supabase/migrations/202610160004_allowance_recovery.sql","utf8"));
 await db.exec(await readFile("supabase/migrations/202610210001_membership_repeat_activation.sql","utf8"));
 for(let n=1;n<=8;n++)await db.query("insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())",[id(n),"person"+n+"@example.test"]);
 await db.exec(await readFile("supabase/migrations/202610240001_annual_gift_fulfillment.sql","utf8"));
 return db;
}
const grant=(db:PGlite,gift:number,user=2,order="PILOT-001")=>db.query<{r:{id:string;expires_at:string;started_at:string;revoked_at:string|null}}>("select rezlee_fulfill_annual_gift($1,$2,$3,$4,$5) r",[id(1),id(gift),id(user),order,"Recipient consent recorded in support case TEST-001"]);
const activate=async(db:PGlite,user:number)=>{await db.exec("update rezlee_membership_campaign set activated=1000");await db.query("select rezlee_activate_member($1)",[id(user)]);};
test("annual gift grants once, supports retry and rejects a conflicting allocation",async()=>{
 const db=await fixture();try{
 await activate(db,2);const [a,b]=await Promise.all([grant(db,100),grant(db,100)]);
 assert.deepEqual(a.rows,b.rows);
 const g=a.rows[0].r;assert.equal(Date.parse(g.expires_at)-Date.parse(g.started_at),365*86400000);
 assert.equal((await db.query("select * from rezlee_support_audit where action='annual_gift_fulfilled'")).rows.length,1);
 assert.equal((await db.query<{m:{plan:string;source:string}}>("select rezlee_membership($1) m",[id(2)])).rows[0].m.source,"annual_gift");
 await assert.rejects(grant(db,101),/Already has Pro/);
 await assert.rejects(grant(db,100,3),/another request/);
 await assert.rejects(grant(db,100,2,"DIFFERENT-ORDER"),/another request/);
 }finally{await db.close();}
});
test("annual gifts reject inactive, unverified, unactivated and already-Pro accounts",async()=>{
 const db=await fixture();try{
 await assert.rejects(grant(db,100),/Activate membership/);
 await db.query("select rezlee_activate_member($1)",[id(2)]);
 await assert.rejects(grant(db,100),/Already has Pro/);
 await activate(db,3);await db.query("update auth.users set email_confirmed_at=null where id=$1",[id(3)]);
 await assert.rejects(grant(db,101,3),/verified account/);
 await activate(db,4);await db.query("update auth.users set active=false where id=$1",[id(4)]);
 await assert.rejects(grant(db,102,4),/verified account/);
 await activate(db,5);await db.query("insert into rezlee_entitlements(user_id,source,expires_at)values($1,'store',now()+interval '1 month')",[id(5)]);
 await assert.rejects(grant(db,103,5),/Already has Pro/);
 await activate(db,6);await db.query("insert into homes(id,user_id)values($1,$2)",[id(20),id(2)]);
 await db.query("insert into household_members(id,home_id,linked_user_id,status)values($1,$2,$3,'active')",[id(21),id(20),id(6)]);
 await assert.rejects(grant(db,104,6),/Already has Pro/);
 }finally{await db.close();}
});
test("revocation is idempotent and preserves unrelated entitlements",async()=>{
 const db=await fixture();try{
 await activate(db,2);await grant(db,100);
 await db.query("insert into rezlee_entitlements(user_id,source)values($1,'founder')",[id(2)]);
 const revoke=()=>db.query("select rezlee_revoke_annual_gift($1,$2,'Customer requested refund in case TEST-002')",[id(1),id(100)]);
 await revoke();await revoke();
 assert.equal((await db.query("select * from rezlee_entitlements where source='founder'")).rows.length,1);
 assert.equal((await db.query("select * from rezlee_entitlements where source='annual_gift'")).rows.length,0);
 assert.ok((await grant(db,100)).rows[0].r.revoked_at);
 assert.equal((await db.query("select * from rezlee_support_audit where action='annual_gift_revoked'")).rows.length,1);
 await db.exec("set role authenticated");await assert.rejects(grant(db,101),/permission denied/);await assert.rejects(revoke(),/permission denied/);await assert.rejects(db.query("select * from rezlee_annual_gifts"),/permission denied/);
 }finally{await db.close();}
});
test("gift duration is 8760 hours across leap years and daylight saving changes",async()=>{
 const db=await fixture();try{
 await db.exec("set timezone='America/Toronto'");
 for(const start of ["2028-02-29T12:00:00Z","2026-03-08T06:30:00Z","2026-11-01T05:30:00Z"]){
 const r=await db.query<{seconds:number}>("select extract(epoch from (($1::timestamptz+interval '8760 hours')-$1::timestamptz))::float8 seconds",[start]);assert.equal(r.rows[0].seconds,365*86400);
 }
 }finally{await db.close();}
});

test("revoking an expired allocation cannot remove a later annual gift",async()=>{
 const db=await fixture();try{
 await activate(db,2);await grant(db,100);
 await db.query("update rezlee_entitlements set expires_at=now()-interval '1 second' where user_id=$1 and source='annual_gift'",[id(2)]);
 await grant(db,101);
 await db.query("select rezlee_revoke_annual_gift($1,$2,'Refund correction for expired allocation')",[id(1),id(100)]);
 assert.equal((await db.query<{product_id:string}>("select product_id from rezlee_entitlements where user_id=$1 and source='annual_gift'",[id(2)])).rows[0].product_id,id(101));
 await db.query("delete from auth.users where id=$1",[id(2)]);
 await assert.rejects(grant(db,101),/another request/);
 assert.equal((await db.query<{user_id:string|null}>("select user_id from rezlee_annual_gifts where id=$1",[id(101)])).rows[0].user_id,null);
 }finally{await db.close();}
});
