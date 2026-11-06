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
 return db;
}
test("Founding grants are idempotent, bounded and preserve older waitlist promises",async()=>{
 const db=await fixture();try{
 const activate=(u:string)=>db.query("select rezlee_activate_member($1)",[u]);
 await Promise.all([activate(id(1)),activate(id(1)),activate(id(2))]);
 assert.equal((await db.query<{activated:number}>("select activated from rezlee_membership_campaign")).rows[0].activated,2);
 await db.exec("update rezlee_membership_campaign set activated=999");
 await Promise.all([activate(id(3)),activate(id(4))]);
 assert.equal((await db.query("select * from rezlee_founder_allocations where slot=1000")).rows.length,1);
 assert.equal((await db.query("select * from rezlee_entitlements where user_id='"+id(4)+"'")).rows.length,0);
 await db.query("insert into rezlee_waitlist(email,slot,created_at,status)values('person5@example.test',9500,now()-interval '1 day','unsubscribed')");
 await activate(id(5));assert.equal((await db.query("select * from rezlee_entitlements where user_id='"+id(5)+"' and source='founder'")).rows.length,1);
 await db.query("update auth.users set email_confirmed_at=null where id=$1",[id(6)]);await assert.rejects(activate(id(6)),/Verify email/);
 await db.query("update auth.users set active=false where id=$1",[id(7)]);await assert.rejects(activate(id(7)),/Account unavailable/);
 await db.query("delete from auth.users where id=$1",[id(3)]);assert.equal((await db.query<{activated:number}>("select activated from rezlee_membership_campaign")).rows[0].activated,1000);
 await db.exec("set role authenticated");await assert.rejects(activate(id(8)),/permission denied/);await assert.rejects(db.query("select * from rezlee_entitlements"),/permission denied/);
 }finally{await db.close();}
});
test("Household access follows active membership; free quotas and store revocation preserve founders",async()=>{
 const db=await fixture();try{
 await db.query("select rezlee_activate_member($1)",[id(1)]);await db.exec("update rezlee_membership_campaign set activated=1000");
 await db.query("select rezlee_activate_member($1)",[id(2)]);
 await db.query("insert into homes(id,user_id)values($1,$2)",[id(20),id(1)]);
 await db.query("insert into household_members(id,home_id,linked_user_id,status)values($1,$2,$3,'active')",[id(21),id(20),id(2)]);
 const member=async(u:string)=>(await db.query<{m:{plan:string;household:boolean}}>("select rezlee_membership($1) m",[u])).rows[0].m;
 assert.equal((await member(id(2))).household,true);
 await db.query("update household_members set status='invited' where id=$1",[id(21)]);assert.equal((await member(id(2))).plan,"free");
 for(let n=0;n<3;n++)assert.equal((await db.query<{r:string}>("select rezlee_reserve_feature($1,'document') r",[id(2)])).rows[0].r,"allowed");
 assert.equal((await db.query<{r:string}>("select rezlee_reserve_feature($1,'document') r",[id(2)])).rows[0].r,"upgrade");
 for(let n=0;n<5;n++)assert.equal((await db.query<{r:string}>("select rezlee_reserve_feature($1,'document') r",[id(1)])).rows[0].r,"allowed");
 const lease=id(30);
 await db.query("insert into rezlee_store_sync(user_id,lease_id,lease_until)values($1,$2,now()+interval '1 minute')",[id(1),lease]);
 await db.query("select rezlee_apply_store_sync($1,$2,now()+interval '1 month','monthly')",[id(1),lease]);
 await db.query("select rezlee_apply_store_sync($1,$2,null,null)",[id(1),lease]);assert.equal((await member(id(1))).plan,"pro","Refund cannot revoke founder grant");
 await assert.rejects(db.query("select rezlee_apply_store_sync($1,$2,now()+interval '1 month','monthly')",[id(1),id(31)]),/expired/);
 }finally{await db.close();}
});
test("Support writes require reasons and current revisions and always append audit evidence",async()=>{
 const db=await fixture();try{
 const change=(action:string,reference:string|null,revision:number|null,payload:unknown,reason="Customer reported a blocked import")=>db.query<{r:{id:string}}>("select rezlee_support_change($1,$2,$3,$4,$5,$6) r",[id(1),action,reference,revision,JSON.stringify(payload),reason]);
 const c=(await change("case_create",null,null,{customerId:id(2),subject:"Missing bills",note:"Signed in, no originals saved"})).rows[0].r;
 await change("case_update",c.id,1,{status:"investigating",note:"Checking saved originals",claim:true});
 await assert.rejects(change("case_update",c.id,1,{status:"resolved",note:"",claim:true}),/Record changed/);
 await assert.rejects(change("goodwill",id(2),null,{},""),/Reason required/);
 await change("goodwill",id(2),null,{});
 assert.equal((await db.query("select * from rezlee_support_audit")).rows.length,3);
 await db.query("insert into provider_registry(id)values($1)",[id(40)]);
 await assert.rejects(change("provider_update",id(40),1,{paused:false,evidence:"live_verified",evidenceReference:""}),/Record changed/);
 await change("provider_update",id(40),1,{paused:true,evidence:"configured",evidenceReference:""});
 assert.equal((await db.query<{paused:boolean}>("select paused from rezlee_provider_controls")).rows[0].paused,true);
 }finally{await db.close();}
});

test("Waitlist proof is bound to account, expires, limits guesses and cannot redeem twice",async()=>{
 const db=await fixture();try{
 await db.exec("update rezlee_membership_campaign set activated=1000");
 await db.query("insert into rezlee_waitlist(email,slot,created_at,status)values('reserved@example.test',1500,now()-interval '1 day','unsubscribed')");
 const start=(user:string,claim:string,email="reserved@example.test")=>db.query("select rezlee_start_waitlist_claim($1,$2,$3,$4)",[user,claim,email,"a".repeat(64)]);
 const finish=async(user:string,claim:string,hash="a".repeat(64))=>(await db.query<{r:string}>("select rezlee_finish_waitlist_claim($1,$2,$3) r",[user,claim,hash])).rows[0].r;
 await start(id(1),id(70));assert.equal(await finish(id(2),id(70)),"invalid");
 for(let n=0;n<5;n++)assert.equal(await finish(id(1),id(70),"b".repeat(64)),"invalid");
 assert.equal(await finish(id(1),id(70)),"invalid");
 await start(id(1),id(71));await db.query("update rezlee_waitlist_claims set expires_at=now()-interval '1 second' where id=$1",[id(71)]);assert.equal(await finish(id(1),id(71)),"invalid");
 await start(id(1),id(72));assert.equal(await finish(id(1),id(72)),"claimed");assert.equal(await finish(id(1),id(72)),"claimed");
 await start(id(2),id(73));assert.equal(await finish(id(2),id(73)),"already_claimed");
 await db.query("update auth.users set email='reserved@example.test' where id=$1",[id(2)]);await db.query("select rezlee_activate_member($1)",[id(2)]);
 assert.equal((await db.query("select * from rezlee_entitlements where user_id=$1",[id(2)])).rows.length,0);
 await start(id(3),id(74),"unknown@example.test");assert.equal(await finish(id(3),id(74)),"invalid");
 assert.equal((await db.query("select * from rezlee_waitlist_redemptions")).rows.length,1);
 }finally{await db.close();}
});
test("Vendor reviews require evidence, a future review date, ownership and current revision",async()=>{
 const db=await fixture();try{
 const change=(revision:number,payload:object)=>db.query("select rezlee_support_change($1,'vendor_update',null,$2,$3,'Verified production dashboard limits')",[id(1),revision,JSON.stringify(payload)]);
 const base={vendor:"supabase",status:"ready",plan:"Production Pro",limitNotes:"Verified production plan, daily email cap and owner. Evidence: internal capacity review.",reviewBefore:new Date(Date.now()+86400000).toISOString()};
 await assert.rejects(change(1,{...base,limitNotes:""}),/Record verified/);
 await assert.rejects(change(1,{...base,reviewBefore:"2000-01-01T00:00:00Z"}),/Review date/);
 await change(1,base);await assert.rejects(change(1,base),/Record changed/);
 const r=(await db.query<{owner_id:string;revision:number}>("select owner_id,revision from rezlee_vendor_reviews")).rows[0];assert.equal(r.owner_id,id(1));assert.equal(r.revision,2);
 assert.equal((await db.query<{reference:string}>("select reference from rezlee_support_audit")).rows[0].reference,"supabase");
 }finally{await db.close();}
});

test("Failed scans restore exactly their own monthly allowance once, including after Pro changes",async()=>{
 const db=await fixture();try{
 await db.exec("update rezlee_membership_campaign set activated=1000");await db.query("select rezlee_activate_member($1)",[id(1)]);
 const reserve=(u:string,r:string)=>db.query("select rezlee_reserve_feature_once($1,'document',$2)",[u,r]);
 await reserve(id(1),id(80));await reserve(id(1),id(81));
 await db.query("select rezlee_refund_failed_feature($1,$2)",[id(2),id(80)]);
 assert.equal((await db.query<{used:number}>("select used from rezlee_feature_usage")).rows[0].used,2);
 await db.query("select rezlee_refund_failed_feature($1,$2)",[id(1),id(80)]);await db.query("select rezlee_refund_failed_feature($1,$2)",[id(1),id(80)]);
 assert.equal((await db.query<{used:number}>("select used from rezlee_feature_usage")).rows[0].used,1);
 await db.query("insert into rezlee_entitlements(user_id,source)values($1,'founder')",[id(1)]);await reserve(id(1),id(82));await db.query("select rezlee_refund_failed_feature($1,$2)",[id(1),id(82)]);
 assert.equal((await db.query<{used:number}>("select used from rezlee_feature_usage")).rows[0].used,1,"An unlimited Pro scan must not refund a previous free scan");
 }finally{await db.close();}
});


test("repeat activation preserves account gates and does not allocate a new founder place",async()=>{
 const db=await fixture();try{
 await db.query("insert into rezlee_member_accounts(user_id)values($1)",[id(1)]);
 const before=(await db.query<{activated:number}>("select activated from rezlee_membership_campaign")).rows[0].activated;
 for(let n=0;n<3;n++)await db.query("select rezlee_activate_member($1)",[id(1)]);
 assert.equal((await db.query<{activated:number}>("select activated from rezlee_membership_campaign")).rows[0].activated,before);
 assert.equal((await db.query("select * from rezlee_founder_allocations where user_id=$1",[id(1)])).rows.length,0);
 await db.query("update auth.users set email_confirmed_at=null where id=$1",[id(1)]);
 await assert.rejects(db.query("select rezlee_activate_member($1)",[id(1)]),/Verify email/);
 await db.query("update auth.users set email_confirmed_at=now(),active=false where id=$1",[id(1)]);
 await assert.rejects(db.query("select rezlee_activate_member($1)",[id(1)]),/Account unavailable/);
 }finally{await db.close();}
});
test("already activated members still redeem a reserved waitlist promise exactly once",async()=>{
 const db=await fixture();try{
 await db.exec("update rezlee_membership_campaign set activated=1000");
 await db.query("select rezlee_activate_member($1)",[id(1)]);
 assert.equal((await db.query("select * from rezlee_entitlements where user_id=$1",[id(1)])).rows.length,0);
 await db.query("insert into rezlee_waitlist(email,slot,created_at,status)values('person1@example.test',9501,now()-interval '1 day','unsubscribed')");
 await db.query("select rezlee_activate_member($1)",[id(1)]);
 await db.query("select rezlee_activate_member($1)",[id(1)]);
 assert.equal((await db.query("select * from rezlee_waitlist_redemptions where user_id=$1",[id(1)])).rows.length,1);
 assert.equal((await db.query("select * from rezlee_entitlements where user_id=$1 and source='founder'",[id(1)])).rows.length,1);
 assert.equal((await db.query<{activated:number}>("select activated from rezlee_membership_campaign")).rows[0].activated,1000);
 }finally{await db.close();}
});
