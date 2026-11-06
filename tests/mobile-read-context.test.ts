import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { mobileReadContext, rememberMobileReadContext, mobileSnapshotQuery } from "../src/lib/supabase/mobile-read-context";
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const client = () => createClient("https://example.invalid", "test-key", { auth: { persistSession: false } });
test("home context cannot cross request clients or authenticated users", () => {
  const first = client(), second = client();
  const value = { homeAccess: { home: { id: other, user_id: user, nickname: "Test" }, role: "owner", memberId: null }, homeSnapshot: null };
  assert.equal(rememberMobileReadContext(first, user, value), true);
  assert.equal(mobileReadContext(first, user)?.homeAccess?.home.id, other);
  assert.equal(mobileReadContext(first, other), undefined);
  assert.equal(mobileReadContext(second, user), undefined);
});
test("malformed or conflicting home roles fail closed while no-home stays explicit", () => {
  const c = client();
  assert.equal(rememberMobileReadContext(c, user, { homeAccess: { home: { id: other, user_id: other, nickname: "Test" }, role: "owner", memberId: null }, homeSnapshot: null }), false);
  assert.equal(mobileReadContext(c, user), undefined);
  assert.equal(rememberMobileReadContext(c, user, { homeAccess: null, homeSnapshot: null }), true);
  assert.equal(mobileReadContext(c, user)?.homeAccess, null);
});

test("screen snapshots skip network only within their own authenticated request", async () => {
  const first=client(),second=client();
  const snapshot={kind:"bills",bills:[{id:"saved"}],billsCount:7,providerActivity:[],actions:[],reviews:[],integrations:[],uploadCapability:true};
  const value={homeAccess:{home:{id:other,user_id:user,nickname:"Test"},role:"owner",memberId:null},homeSnapshot:null,screenSnapshot:snapshot};
  assert.equal(rememberMobileReadContext(first,user,value),true);
  let calls=0;const fallback=async()=>{calls++;return{data:[{id:"network"}],error:null,count:1};};
  const result=await mobileSnapshotQuery(first,user,"bills",fallback);
  assert.equal(result.count,7);assert.equal(result.data?.[0].id,"saved");assert.equal(calls,0);
  await mobileSnapshotQuery(second,user,"bills",fallback);
  await mobileSnapshotQuery(first,other,"bills",fallback);assert.equal(calls,2);
  assert.equal(rememberMobileReadContext(client(),user,{...value,screenSnapshot:{...snapshot,billsCount:-1}}),false);
});
