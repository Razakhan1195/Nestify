import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Real PostgreSQL engine, isolated fixtures. Auth/storage infrastructure is stubbed;
// application schema, migrations, policies and functions are loaded from the repository.
test("database migrations, tenant isolation, private storage, atomic task recurrence, and AI cap", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role authenticator; create role service_role bypassrls;
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
      "select tablename from pg_tables where schemaname='public' and tablename not in ('rezlee_ai_reservations','care_plan_receipts','statement_read_attempts')",
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
    // Care lifecycle against the real schema/functions, with isolated household fixtures.
    const ownerMember = (await db.query<{id:string}>(`select id from public.household_members where home_id='${ha}' and linked_user_id='${a}' and role='owner' and status='active'`)).rows[0].id;
    const guestMember = "dddddddd-dddd-4ddd-8ddd-dddddddddd02";
    const rotation = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await db.exec(`insert into public.household_members(id,home_id,created_by_user_id,linked_user_id,display_name,role,status)
      values('${guestMember}','${ha}','${a}','${b}','Guest','member','active');
      insert into public.household_rotations(id,home_id,created_by_user_id,title) values('${rotation}','${ha}','${a}','Test cleaning');
      insert into public.household_rotation_members(rotation_id,member_id,position) values('${rotation}','${ownerMember}',0),('${rotation}','${guestMember}',1);`);
    const routine = await db.query<{id:string}>(`insert into public.maintenance_tasks(user_id,home_id,title,recurrence,due_date,status,assigned_member_id,rotation_id)
      values('${a}','${ha}','Weekly cleaning lifecycle','weekly',current_date - 14,'open','${guestMember}','${rotation}') returning id`);
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    assert.equal((await db.query(`select id from public.homes where id='${ha}'`)).rows.length,1,"active member can resolve the shared home before calling completion");
    assert.equal((await db.query(`select id from public.maintenance_tasks where id='${routine.rows[0].id}'`)).rows.length,1,"active member can discover assigned Care tasks");
    assert.equal((await db.query(`select id from public.bills where home_id='${ha}'`)).rows.length,0,"shared membership does not expose private bills");
    assert.equal((await db.query(`update public.homes set nickname='Forbidden' where id='${ha}' returning id`)).rows.length,0,"member cannot edit shared home");
    assert.equal((await db.query(`update public.maintenance_tasks set title='Forbidden' where id='${routine.rows[0].id}' returning id`)).rows.length,0,"member cannot directly edit shared task");
    assert.equal((await db.query(`delete from public.maintenance_tasks where id='${routine.rows[0].id}' returning id`)).rows.length,0,"member cannot delete shared task");
    await assert.rejects(db.exec(`insert into public.maintenance_tasks(user_id,home_id,title) values('${b}','${ha}','Forbidden shared insert')`),"shared home read access cannot authorize foreign-home writes");
    const firstTurn = (await db.query<{result:{completed:boolean;next_date:string;next_task_id:string;next_assigned_member_id:string}}>(`select public.complete_rezlee_task('${routine.rows[0].id}') as result`)).rows[0].result;
    assert.equal(firstTurn.completed,true);
    assert.equal(firstTurn.next_assigned_member_id,ownerMember);
    const expectedDate = (await db.query<{value:string}>("select (current_date + 7)::text as value")).rows[0].value;
    assert.equal(firstTurn.next_date,expectedDate,"late completion creates one future occurrence, not a backlog");
    assert.equal((await db.query<{result:{completed:boolean}}>(`select public.complete_rezlee_task('${routine.rows[0].id}') as result`)).rows[0].result.completed,false,"repeated completion cannot duplicate the next occurrence");
    await assert.rejects(db.exec(`select public.complete_rezlee_task('${firstTurn.next_task_id}')`),"member cannot complete another person's assigned turn");
    await db.exec(`set request.jwt.claim.sub='${a}'`);
    const turns = await db.query<{status:string;completed_at:string|null}>(`select status,completed_at from public.maintenance_tasks where title='Weekly cleaning lifecycle' order by created_at,id`);
    assert.equal(turns.rows.length,2);
    assert.equal(turns.rows.filter(t=>t.status==='completed' && t.completed_at).length,1);
    assert.equal(turns.rows.filter(t=>t.status==='open').length,1);
    const secondTurn = (await db.query<{result:{next_assigned_member_id:string;next_task_id:string}}>(`select public.complete_rezlee_task('${firstTurn.next_task_id}') as result`)).rows[0].result;
    assert.equal(secondTurn.next_assigned_member_id,guestMember,"rotation wraps to the next person");
    await db.exec(`delete from public.maintenance_tasks where id='${secondTurn.next_task_id}'`);
    assert.equal((await db.query(`select id from public.maintenance_tasks where title='Weekly cleaning lifecycle' and status='open'`)).rows.length,0,"removing the open recurring task stops future occurrences");
    assert.equal((await db.query(`select id from public.maintenance_tasks where title='Weekly cleaning lifecycle' and status='completed'`)).rows.length,2,"removing the next occurrence preserves completed history");
    const once = (await db.query<{id:string}>(`insert into public.maintenance_tasks(user_id,home_id,title,recurrence,status) values('${a}','${ha}','One-time lifecycle',null,'open') returning id`)).rows[0].id;
    const onceDone = (await db.query<{result:{completed:boolean;next_date:null;next_task_id:null}}>(`select public.complete_rezlee_task('${once}') as result`)).rows[0].result;
    assert.equal(onceDone.completed,true); assert.equal(onceDone.next_date,null); assert.equal(onceDone.next_task_id,null);
    await assert.rejects(db.exec(`insert into public.maintenance_tasks(user_id,home_id,title,assigned_member_id) values('${b}','${hb}','Cross-home assignment','${ownerMember}')`));

    // Deletion of private records/belongings stays owner-only even for a shared Care member.
    await db.exec(`insert into public.documents(user_id,home_id,title) values('${a}','${ha}','Private deletion fixture');
      insert into public.inventory_items(user_id,home_id,name) values('${a}','${ha}','Private item deletion fixture');
      set request.jwt.claim.sub='${b}'`);
    assert.equal((await db.query(`delete from public.documents where home_id='${ha}' returning id`)).rows.length,0,"shared member cannot delete private documents");
    assert.equal((await db.query(`delete from public.inventory_items where home_id='${ha}' returning id`)).rows.length,0,"shared member cannot delete private belongings");
    await db.exec(`set request.jwt.claim.sub='${a}'`);
    assert.equal((await db.query(`delete from public.documents where title='Private deletion fixture' returning id`)).rows.length,1,"owner can remove their own record");
    assert.equal((await db.query(`delete from public.inventory_items where name='Private item deletion fixture' returning id`)).rows.length,1,"owner can remove their own item");

    // Atomic plan activation: replay, competing retries, changed input, rollback and access.
    const planTasks = [{ title: "Receipt-test floors", category: "Cleaning", description: "", recurrence: "weekly", priority: "normal", due_date: "2026-10-01" }, { title: "Receipt-test kitchen", category: "Cleaning", description: "", recurrence: "daily", priority: "normal", due_date: "2026-10-02" }];
    const savePlan = (key: string, rows: unknown = planTasks, mode = "rotate", people = [ownerMember, guestMember]) => db.query<{result:{ok:boolean;count:number;taskIds:string[]}}>(
      "select public.save_rezlee_care_plan($1::uuid,$2::text,$3::jsonb,$4::text,$5::uuid[],'cleaning') as result",
      [ha,key,JSON.stringify(rows),mode,`{${people.join(',')}}`],
    );
    const [save1,save2] = await Promise.all([savePlan("same-save-key-1"),savePlan("same-save-key-1")]);
    assert.deepEqual(save1.rows[0].result,save2.rows[0].result,"competing retries return the committed result");
    assert.equal(save1.rows[0].result.count,2);
    assert.equal((await db.query("select id from public.maintenance_tasks where title like 'Receipt-test %'")).rows.length,2);
    assert.equal((await db.query("select request_id from public.care_plan_receipts where request_id='same-save-key-1'")).rows.length,1);
    const replay = await savePlan("same-save-key-1");
    assert.deepEqual(replay.rows[0].result.taskIds,save1.rows[0].result.taskIds,"response lost after commit replays the same task ids");
    await assert.rejects(savePlan("same-save-key-1",[{...planTasks[0],title:"Changed choices"}]),"a key cannot be reused with a different payload");
    await assert.rejects(savePlan("bad-save-key-1",[{...planTasks[0],title:"Must rollback"},{...planTasks[1],due_date:"2026-02-30"}]),"invalid second task rolls back the whole transaction");
    assert.equal((await db.query("select id from public.maintenance_tasks where title='Must rollback'")).rows.length,0);
    assert.equal((await db.query("select request_id from public.care_plan_receipts where request_id='bad-save-key-1'")).rows.length,0);
    await assert.rejects(savePlan("bad-rotation-key",planTasks,"rotate",[ownerMember]),"one member cannot form a rotation");
    await assert.rejects(savePlan("bad-members-key",planTasks,"person",["ffffffff-ffff-4fff-8fff-ffffffffffff"]),"foreign or missing member fails closed");
    await assert.rejects(db.exec("delete from public.care_plan_receipts"),"clients cannot remove duplicate protection");
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    await assert.rejects(savePlan("member-save-key"),"shared members cannot activate owner plans");
    assert.equal((await db.query("select * from public.care_plan_receipts")).rows.length,0,"receipts are owner-private");
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
    await db.query("select public.set_rezlee_ai_consent(true, '2026-10-13')");
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
    await db.query("select public.set_rezlee_ai_consent(true, '2026-10-13')");
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