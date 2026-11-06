import test from "node:test";
import assert from "node:assert/strict";

import { buildHomeContext } from "../src/lib/assistant/home-context";

function thenableResult(data: unknown[]) {
  return {
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve(resolve({ data, error: null }));
    },
  };
}

function tableRows(table: string) {
  const rows: Record<string, unknown[]> = {
    bills: [
      {
        name: "Hydro",
        amount: 120,
        currency: "CAD",
        due_date: "2026-09-25",
        status: "upcoming",
      },
    ],
    maintenance_tasks: [
      {
        title: "Replace filter",
        due_date: "2026-09-24",
        status: "open",
        category: "HVAC",
        recurrence: "quarterly",
      },
    ],
    documents: [],
    inventory_items: [],
    repair_issues: [],
    providers: [
      {
        display_name: "Utility Co",
        name: "utility",
        connection_status: "connected",
      },
    ],
  };
  return rows[table] ?? [];
}

test("assistant home context supports Supabase thenable query builders without catch()", async () => {
  const supabase = {
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() { return builder; },
        limit() {
          return thenableResult(tableRows(table));
        },
      };
      return builder;
    },
  };

  const context = await buildHomeContext(
    supabase as never,
    "user-1",
    {
      id: "home-1",
      user_id: "user-1",
      nickname: "Test home",
      street_address: null,
      city: "Pickering",
      province: "ON",
      postal_code: null,
      country: "Canada",
      home_type: "Townhouse",
      ownership_type: "Own",
      closing_date: null,
      approximate_year_built: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  );

  assert.match(context, /HOME: Test home/);
  assert.match(context, /RECORDED DATA: 1 bills · 1 care tasks/);
  assert.match(context, /Hydro/);
  assert.match(context, /Replace filter/);
  assert.doesNotMatch(context, /temporarily unavailable/i);
});

test("assistant keeps Green Button history separate from open bills and includes individual dated statements for month questions", async () => {
  const rows: Record<string, unknown[]> = {
    bills: [
      {
        name: "Elexicon Energy statement",
        amount: 100,
        currency: "CAD",
        due_date: "2026-08-15",
        status: "archived",
        source: "ezgb",
        billing_period_start: "2026-06-01",
        billing_period_end: "2026-06-30",
      },
      {
        name: "Elexicon Energy statement",
        amount: 125,
        currency: "CAD",
        due_date: "2026-09-15",
        status: "archived",
        source: "ezgb",
        billing_period_start: "2026-07-01",
        billing_period_end: "2026-07-31",
      },
    ],
    maintenance_tasks: [],
    documents: [],
    inventory_items: [],
    repair_issues: [],
    providers: [],
  };

  const supabase = {
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() { return builder; },
        limit() {
          return thenableResult(rows[table] ?? []);
        },
      };
      return builder;
    },
  };

  const context = await buildHomeContext(
    supabase as never,
    "user-1",
    {
      id: "home-1",
      user_id: "user-1",
      nickname: "Test home",
      street_address: null,
      city: "Pickering",
      province: "ON",
      postal_code: null,
      country: "Canada",
      home_type: "Townhouse",
      ownership_type: "Own",
      closing_date: null,
      approximate_year_built: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  );

  assert.match(context, /GREEN BUTTON UTILITY HISTORY:/);
  assert.match(context, /2 dated statements in this snapshot/);
  assert.match(context, /"periodStart":"2026-07-01","periodEnd":"2026-07-31","recordedAmount":"CAD 125\.00"/);
  assert.doesNotMatch(context, /12-month average/);
  assert.match(context, /clarify which one/);
  assert.doesNotMatch(context, /hasn.t added much/);
  assert.doesNotMatch(context, /OPEN BILLS & REMINDERS:/);
  assert.doesNotMatch(context, /OVERDUE/);
});


test("statement context stays household scoped, bounded, and identifies ambiguous years/accounts", async()=>{
 const calls: Array<{table:string;filters:unknown[];orders:unknown[];limit?:number}> = [];
 const rows = Array.from({length:50},(_,i)=>({id:`bill-${i}`,provider_id:i%2?"account-a":"account-b",name:"Enbridge Gas",amount:10+i,currency:"CAD",status:"archived",source:"ezgb",due_date:null,billing_period_start:i%2?"2026-07-01":"2025-07-01",billing_period_end:i%2?"2026-07-31":"2025-07-31"}));
 const supabase={from(table:string){const call={table,filters:[] as unknown[],orders:[] as unknown[],limit:undefined as number|undefined};calls.push(call);const b={select(){return b;},eq(k:string,v:string){call.filters.push([k,v]);return b;},order(k:string,v:unknown){call.orders.push([k,v]);return b;},limit(n:number){call.limit=n;return thenableResult(table==="bills"?rows:[]);}};return b;}};
 const context=await buildHomeContext(supabase as never,"owner",{id:"home",nickname:"QA"} as never);
 const billQuery=calls.find(c=>c.table==="bills")!;
 assert.deepEqual(billQuery.filters,[["user_id","owner"],["home_id","home"]]);
 assert.equal(billQuery.limit,50);assert.equal(billQuery.orders.length,2);
 assert.match(context,/"accountReference":"account-a"/);assert.match(context,/"accountReference":"account-b"/);
 assert.match(context,/2026-07-01/);assert.match(context,/2025-07-01/);
 assert.match(context,/Older records may exist outside it/);assert.match(context,/clarify which one/);
 assert.doesNotMatch(context,/hasn't added much/);
});
