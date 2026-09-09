import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Real PostgreSQL engine, isolated fixtures. Auth/storage infrastructure is stubbed;
// application schema, migrations, policies and functions are loaded from the repository.
test("database migrations, tenant isolation, private storage, atomic task recurrence, and AI cap", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
      grant usage on schema public, auth, storage to authenticated;
      grant execute on function auth.uid(), storage.foldername(text) to authenticated;
      grant all on storage.objects to authenticated;`);
    const files = [
      "supabase/schema.sql",
      ...(await readdir("supabase/migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => `supabase/migrations/${f}`),
    ];
    for (const file of files) {
      const sql = (await readFile(file, "utf8")).replace(
        /create extension if not exists "pgcrypto";/g,
        "",
      );
      try {
        await db.exec(sql);
      } catch (error) {
        throw new Error(`Migration ${file}: ${String(error)}`);
      }
    }
    // Supabase grants are platform-owned, not part of the application's schema dump.
    const tables = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname='public' and tablename <> 'rezlee_ai_reservations'",
    );
    for (const { tablename } of tables.rows)
      await db.exec(
        `grant select, insert, update, delete on public."${tablename}" to authenticated`,
      );
    const a = "11111111-1111-4111-8111-111111111111",
      b = "22222222-2222-4222-8222-222222222222";
    const ha = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      hb = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await db.exec(`insert into auth.users values ('${a}','a@example.invalid'),('${b}','b@example.invalid');
      insert into public.homes(id,user_id,nickname) values('${ha}','${a}','A place'),('${hb}','${b}','B place');
      insert into public.bills(user_id,home_id,name,amount,due_date) values('${a}','${ha}','A bill',120,current_date),('${b}','${hb}','B bill',240,current_date);
      set role authenticated; set request.jwt.claim.sub='${a}';`);
    const bills = await db.query<{ name: string }>(
      "select name from public.bills",
    );
    assert.deepEqual(
      bills.rows.map((r) => r.name),
      ["A bill"],
    );
    const modified = await db.query(
      `update public.bills set amount=0 where user_id='${b}' returning id`,
    );
    assert.equal(modified.rows.length, 0);
    await assert.rejects(
      db.exec(
        `insert into public.bills(user_id,home_id,name) values('${b}','${hb}','intrusion')`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into public.bills(user_id,home_id,name) values('${a}','${hb}','cross-home')`,
      ),
    );
    await db.exec(
      `insert into storage.objects(bucket_id,name) values('rezlee-documents','${a}/${ha}/file.pdf')`,
    );
    await assert.rejects(
      db.exec(
        `insert into storage.objects(bucket_id,name) values('rezlee-documents','${b}/${hb}/file.pdf')`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into storage.objects(bucket_id,name) values('rezlee-documents','${a}/${hb}/file.pdf')`,
      ),
    );
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${a}'`);
    const task = await db.query<{ id: string }>(
      `insert into public.maintenance_tasks(user_id,home_id,title,category,recurrence,due_date,status) values('${a}','${ha}','Filter','HVAC','monthly',current_date,'open') returning id`,
    );
    const id = task.rows[0].id;
    const completed = await db.query<{
      result: { completed: boolean; next_date: string };
    }>(`select public.complete_rezlee_task('${id}') as result`);
    assert.equal(completed.rows[0].result.completed, true);
    assert.ok(completed.rows[0].result.next_date);
    const again = await db.query<{ result: { completed: boolean } }>(
      `select public.complete_rezlee_task('${id}') as result`,
    );
    assert.equal(again.rows[0].result.completed, false);
    assert.equal(
      (
        await db.query(
          `select id from public.maintenance_tasks where title='Filter'`,
        )
      ).rows.length,
      2,
    );
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    await assert.rejects(
      db.exec(`select public.complete_rezlee_task('${id}')`),
    );
    await db.exec(`set request.jwt.claim.sub='${a}'`);
    const saved = await db.query<{ result: { id: string } }>(
      `select public.save_rezlee_conversation('${ha}',null,'Test',true,'[{"id":"m1","role":"user","content":"Original"}]'::jsonb) as result`,
    );
    const conversationId = saved.rows[0].result.id;
    await assert.rejects(
      db.query(
        `select public.save_rezlee_conversation('${ha}','${conversationId}','Changed',true,'[{"id":"m2","role":"invalid","content":"Bad"}]'::jsonb)`,
      ),
    );
    assert.deepEqual(
      (
        await db.query<{ content: string }>(
          `select content from public.assistant_messages where conversation_id='${conversationId}'`,
        )
      ).rows.map((r) => r.content),
      ["Original"],
    );
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    await assert.rejects(
      db.query(
        `select public.save_rezlee_conversation('${ha}','${conversationId}','Intrusion',true,'[{"role":"user","content":"Bad"}]'::jsonb)`,
      ),
    );
    await db.exec(`set request.jwt.claim.sub='${a}'`);
    for (let i = 0; i < 40; i++)
      assert.equal(
        (
          await db.query<{ allowed: boolean }>(
            "select public.reserve_rezlee_ai_request() as allowed",
          )
        ).rows[0].allowed,
        true,
      );
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select public.reserve_rezlee_ai_request() as allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await assert.rejects(db.exec("delete from public.rezlee_ai_reservations"));
    await assert.rejects(
      db.exec(
        "update public.rezlee_ai_reservations set created_at='2000-01-01'",
      ),
    );
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select public.reserve_rezlee_ai_request() as allowed",
        )
      ).rows[0].allowed,
      true,
    );
    const policies = await db.query<{
      tablename: string;
      rowsecurity: boolean;
    }>(
      "select tablename, rowsecurity from pg_tables where schemaname='public'",
    );
    assert.ok(
      policies.rows.every((r) => r.rowsecurity),
      `Tables without RLS: ${policies.rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)}`,
    );
  } finally {
    await db.close();
  }
});
