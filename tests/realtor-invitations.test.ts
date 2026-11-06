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
async function current(){const db=await fixture();await db.exec(await readFile("supabase/migrations/202610240002_close_first_thousand_offer.sql","utf8"));await db.exec(await readFile("supabase/migrations/202610240003_realtor_gift_invitations.sql","utf8"));return db;}
const invite=(db:PGlite,n=100,email="person2@example.test")=>db.query("insert into rezlee_gift_invitations(id,realtor_name,recipient_email,order_reference,created_by) values($1,'Taylor Homes',$2,'ORDER-001',$3)",[id(n),email,id(1)]);
const claim=(db:PGlite,n=100,user=2)=>db.query<{r:{realtorName:string;expires_at:string;started_at:string}}>("select rezlee_claim_gift_invitation($1,$2) r",[id(n),id(user)]);
test("invitation activates a verified recipient once, names the realtor, and keeps retry expiry",async()=>{const db=await current();try{await invite(db);const [a,b]=await Promise.all([claim(db),claim(db)]);assert.deepEqual(a.rows,b.rows);assert.equal(a.rows[0].r.realtorName,"Taylor Homes");assert.equal(Date.parse(a.rows[0].r.expires_at)-Date.parse(a.rows[0].r.started_at),365*86400000);assert.equal((await db.query("select * from rezlee_annual_gifts")).rows.length,1);}finally{await db.close();}});
test("wrong account, expired link, unverified email and revoked invitation cannot claim",async()=>{const db=await current();try{await invite(db);await assert.rejects(claim(db,100,3),/invited verified email/);await db.query("update auth.users set email_confirmed_at=null where id=$1",[id(2)]);await assert.rejects(claim(db),/invited verified email/);await db.query("update auth.users set email_confirmed_at=now() where id=$1",[id(2)]);await db.exec("update rezlee_gift_invitations set claim_by=now()-interval '1 second'");await assert.rejects(claim(db),/expired/);await db.exec("update rezlee_gift_invitations set revoked_at=now()");await assert.rejects(claim(db),/unavailable/);assert.equal((await db.query("select * from rezlee_annual_gifts")).rows.length,0);}finally{await db.close();}});
test("closed first-thousand offer preserves existing founders and reserved waitlist promises",async()=>{const db=await fixture();try{await db.query("select rezlee_activate_member($1)",[id(2)]);await db.exec(await readFile("supabase/migrations/202610240002_close_first_thousand_offer.sql","utf8"));await db.query("select rezlee_activate_member($1)",[id(3)]);assert.equal((await db.query("select * from rezlee_entitlements where user_id=$1",[id(3)])).rows.length,0);assert.equal((await db.query("select * from rezlee_entitlements where user_id=$1 and source='founder'",[id(2)])).rows.length,1);await db.exec("insert into rezlee_waitlist(email,slot,status)values('person4@example.test',4,'confirmed')");await db.query("select rezlee_activate_member($1)",[id(4)]);assert.equal((await db.query("select * from rezlee_entitlements where user_id=$1 and source='founder'",[id(4)])).rows.length,1);}finally{await db.close();}});
test("existing Pro is protected and public roles cannot inspect invitations or grant themselves access",async()=>{const db=await current();try{await invite(db);await db.query("insert into rezlee_entitlements(user_id,source)values($1,'founder')",[id(2)]);await assert.rejects(claim(db),/Already has Pro/);assert.equal((await db.query("select * from rezlee_annual_gifts")).rows.length,0);await db.exec("set role authenticated");await assert.rejects(claim(db),/permission denied/);await assert.rejects(db.query("select * from rezlee_gift_invitations"),/permission denied/);}finally{await db.close();}});

test("deleted accounts leave no invitation email and cannot transfer a claimed gift",async()=>{const db=await current();try{await invite(db);await claim(db);await db.query("delete from auth.users where id=$1",[id(2)]);const row=(await db.query<{recipient_email:string;revoked_at:string;claimed_by:null}>("select * from rezlee_gift_invitations")).rows[0];assert.equal(row.recipient_email,"deleted-account@invalid");assert.equal(row.claimed_by,null);assert.ok(row.revoked_at);}finally{await db.close();}});
