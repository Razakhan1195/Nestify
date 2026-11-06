import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  normalizedEmail,
  tokenHash,
  unsubscribeToken,
  validUnsubscribe,
  sameOrigin,
} from "../src/lib/waitlist/policy";
test("email, origin and signed unsubscribe validation", () => {
  assert.equal(
    normalizedEmail("  Example+1@EXAMPLE.com "),
    "example+1@example.com",
  );
  assert.equal(normalizedEmail("bad@"), null);
  assert.equal(normalizedEmail("a.b@example.com"), "a.b@example.com");
  const t = unsubscribeToken("one", "a".repeat(40));
  assert(validUnsubscribe("one", t, "a".repeat(40)));
  assert(!validUnsubscribe("two", t, "a".repeat(40)));
  assert(
    sameOrigin(
      new Request("https://rezlee.com/api", {
        headers: { origin: "https://rezlee.com" },
      }),
      "https://rezlee.com",
    ),
  );
  assert(
    !sameOrigin(
      new Request("https://rezlee.com/api", {
        headers: { origin: "https://evil.example" },
      }),
      "https://rezlee.com",
    ),
  );
});
test("database: private access, idempotency, limits, expiry and final reservation", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role;",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/202609300002_founding_waitlist.sql",
        "utf8",
      ),
    );
    const call = async (sql: string, args: unknown[] = []) =>
      (await db.query<{ result: Record<string, unknown> }>(sql, args)).rows[0]
        .result;
    const join = await call(
      "select public.rezlee_join_waitlist($1,$2) result",
      ["test@example.com", tokenHash("valid")],
    );
    assert(join.id);
    const duplicate = await call(
      "select public.rezlee_join_waitlist($1,$2) result",
      ["TEST@example.com", tokenHash("other")],
    );
    assert.deepEqual(duplicate, {});
    assert.equal(
      (
        await call("select public.rezlee_confirm_waitlist($1,$2) result", [
          join.id,
          "wrong",
        ])
      ).state,
      "invalid",
    );
    const confirms = await Promise.all(
      Array.from({ length: 5 }, () =>
        call("select public.rezlee_confirm_waitlist($1,$2) result", [
          join.id,
          tokenHash("valid"),
        ]),
      ),
    );
    assert(confirms.every((r) => r.slot === 1));
    await db.exec("set role anon");
    await assert.rejects(
      () => db.query("select email from public.rezlee_waitlist"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.rezlee_join_waitlist('intruder@example.com','x')",
        ),
      /permission denied/,
    );
    await db.exec("reset role; set role authenticated");
    await assert.rejects(
      () => db.query("select * from public.rezlee_waitlist"),
      /permission denied/,
    );
    await db.exec("reset role");
    const expired = await call(
      "select public.rezlee_join_waitlist($1,$2) result",
      ["expired@example.com", "h"],
    );
    await db.query(
      "update public.rezlee_waitlist set confirmation_expires_at=now()-interval '1 day' where id=$1",
      [expired.id],
    );
    assert.equal(
      (
        await call("select public.rezlee_confirm_waitlist($1,$2) result", [
          expired.id,
          "h",
        ])
      ).state,
      "expired",
    );
    await db.exec("update public.rezlee_waitlist_campaign set allocated=9999");
    const a = await call("select public.rezlee_join_waitlist($1,$2) result", [
        "last@example.com",
        "h",
      ]),
      b = await call("select public.rezlee_join_waitlist($1,$2) result", [
        "late@example.com",
        "h",
      ]);
    const results = await Promise.all(
      [a, b].map((r) =>
        call("select public.rezlee_confirm_waitlist($1,$2) result", [
          r.id,
          "h",
        ]),
      ),
    );
    assert.deepEqual(
      results.map((r) => r.slot).sort((a, b) => Number(b) - Number(a)),
      [10000, null],
    );
    await db.query(
      "update public.rezlee_waitlist set status='unsubscribed', confirmation_hash=null, last_requested_at=now()-interval '1 hour' where id=$1",
      [join.id],
    );
    assert.equal(
      (
        await call("select public.rezlee_confirm_waitlist($1,$2) result", [
          join.id,
          tokenHash("valid"),
        ])
      ).state,
      "invalid",
    );
    await call("select public.rezlee_join_waitlist($1,$2) result", [
      "test@example.com",
      "new",
    ]);
    assert.equal(
      (
        await call("select public.rezlee_confirm_waitlist($1,$2) result", [
          join.id,
          "new",
        ])
      ).slot,
      1,
    );
    const limit = async () =>
      (
        await db.query<{ ok: boolean }>(
          "select public.rezlee_waitlist_limit('test',2,3600) ok",
        )
      ).rows[0].ok;
    assert(await limit());
    assert(await limit());
    assert.equal(await limit(), false);
    await db.exec(
      "insert into public.rezlee_waitlist_limits values('monthly',now()-interval '3 days',2000)",
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select public.rezlee_waitlist_limit('monthly',2000,2592000) ok",
        )
      ).rows[0].ok,
      false,
    );
  } finally {
    await db.close();
  }
});

test("public allocation is separate from people and enforces the final available place",async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon; create role authenticated; create role service_role;");
 await db.exec(readFileSync("supabase/migrations/202609300002_founding_waitlist.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/202609300003_waitlist_public_allocation.sql","utf8"));
 const initial=(await db.query<{allocated:number;held_back:number}>("select allocated,held_back from public.rezlee_waitlist_campaign")).rows[0];
 assert.deepEqual(initial,{allocated:0,held_back:4679});
 assert.equal((await db.query<{n:number}>("select count(*)::integer n from public.rezlee_waitlist")).rows[0].n,0);
 await db.exec("update public.rezlee_waitlist_campaign set allocated=5320");
 const join=async(email:string)=>(await db.query<{r:{id:string}}>("select public.rezlee_join_waitlist($1,$2) r",[email,tokenHash('proof')])).rows[0].r;
 const first=await join('first@example.com'),second=await join('second@example.com');
 const confirm=async(id:string)=>(await db.query<{r:{slot:number|null}}>("select public.rezlee_confirm_waitlist($1,$2) r",[id,tokenHash('proof')])).rows[0].r;
 const results=await Promise.all([confirm(first.id),confirm(second.id)]);
 assert.deepEqual(results.map(x=>x.slot).sort((a,b)=>(a??99999)-(b??99999)),[5321,null]);
 assert.equal((await db.query<{allocated:number}>("select allocated from public.rezlee_waitlist_campaign")).rows[0].allocated,5321);
 await assert.rejects(()=>db.exec("update public.rezlee_waitlist_campaign set held_back=4680"));
 await db.exec("set role anon");await assert.rejects(()=>db.query("select * from public.rezlee_waitlist_campaign"));
 }finally{await db.close();}
});
