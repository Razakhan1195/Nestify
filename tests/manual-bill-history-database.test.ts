import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { historicalBillRow } from "../src/lib/product/manual-bill-history";

test("historical statements enforce period uniqueness, payment safety, edits and owner isolation in Postgres", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  const ha = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", hb = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const fields = { record_kind: "historical" as const, bill_title: "July electricity", category: "Electricity", provider_name: "Example Hydro", account_number: "Home", amount: "123.40", due_date: "", billing_period_start: "2026-07-01", billing_period_end: "2026-07-31" };
  const insert = async (row: Record<string, unknown>) => {
    const keys = Object.keys(row);
    return db.query<{ id: string }>(`insert into public.bills (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(row).map(v => typeof v === "object" && v !== null ? JSON.stringify(v) : v));
  };
  try {
    await db.exec(`create role anon; create role authenticated; create role authenticator; create role service_role bypassrls;
      create schema auth; create schema storage; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
      grant usage on schema public,auth,storage to authenticated,service_role; grant all on storage.objects to authenticated;`);
    for (const file of ["supabase/schema.sql", ...(await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort().map(f => `supabase/migrations/${f}`)]) {
      await db.exec((await readFile(file, "utf8")).replace(/create extension if not exists "pgcrypto";/g, ""));
    }
    await db.exec(`grant select,insert,update,delete on public.bills to authenticated; grant select on public.homes,public.providers to authenticated;
      insert into auth.users values('${a}','a@example.invalid'),('${b}','b@example.invalid');
      insert into public.homes(id,user_id,nickname) values('${ha}','${a}','A'),('${hb}','${b}','B');
      insert into public.household_members(home_id,created_by_user_id,linked_user_id,display_name,role,status) values('${ha}','${a}','${b}','Member','member','active');
      set role authenticated; set request.jwt.claim.sub='${a}';`);
    assert.equal((await db.query<{ ready: boolean }>("select public.rezlee_manual_history_available() ready")).rows[0].ready, true);
    const first = historicalBillRow(a, ha, fields);
    const saved = (await insert(first)).rows[0].id;
    await assert.rejects(insert({ ...first, amount: 999 }), /duplicate key/);
    await assert.rejects(insert(historicalBillRow(a, ha, { ...fields, provider_name: " EXAMPLE HYDRO ", account_number: "home", category: "electricity" })), /duplicate key/);
    await assert.rejects(db.query("update public.bills set status='paid', payment_status='paid' where id=$1", [saved]), /check constraint/);
    await assert.rejects(db.query("update public.bills set current_amount_due=123.40 where id=$1", [saved]), /check constraint/);
    await assert.rejects(db.query("update public.bills set billing_period_start='2026-08-01' where id=$1", [saved]), /check constraint/);
    const june = (await insert(historicalBillRow(a, ha, { ...fields, amount: "110", billing_period_start: "2026-06-01", billing_period_end: "2026-06-30" }))).rows[0].id;
    await assert.rejects(db.query("update public.bills set billing_period_start='2026-07-01',billing_period_end='2026-07-31' where id=$1", [june]), /duplicate key/);
    await db.query("update public.bills set amount=122.40 where id=$1", [saved]);
    const corrected = (await db.query<{ amount: string; status: string; payment_status: null }>("select amount,status,payment_status from public.bills where id=$1", [saved])).rows[0];
    assert.equal(Number(corrected.amount), 122.4); assert.equal(corrected.status, "archived"); assert.equal(corrected.payment_status, null);
    // A separate account with the same dates is valid; it is not the same statement.
    await insert(historicalBillRow(a, ha, { ...fields, account_number: "Cottage" }));
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    assert.equal((await db.query("select id from public.bills")).rows.length, 0);
    await assert.rejects(insert(historicalBillRow(b, ha, fields)), /row-level security|unavailable|owner/i);
    assert.equal((await db.query("update public.bills set amount=1 where id=$1 returning id", [saved])).rows.length, 0);
    assert.equal((await db.query("delete from public.bills where id=$1 returning id", [saved])).rows.length, 0);
    await insert(historicalBillRow(b, hb, fields));
    await db.exec(`set request.jwt.claim.sub='${a}'`);
    await db.query("delete from public.bills where id=$1", [saved]);
    assert.equal((await db.query("select id from public.bills where id=$1", [saved])).rows.length, 0);
  } finally { await db.close(); }
});
