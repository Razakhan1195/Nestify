import test from "node:test";
import assert from "node:assert/strict";
import { createSetupDraftStore, parseSetupDraft, shouldResumeSetup, type SetupDraft } from "../apps/mobile/src/lib/onboarding-draft-core";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const draft = (city = "Toronto"): SetupDraft => ({ version: 1, updatedAt: Date.now(), form: { nickname: "Home", city, province: "Ontario", postal_code: "M5V 1A1", home_type: "", ownership_type: "" }, goal: "bills", phase: "form" });
function memory() {
 const data = new Map<string,string>();
 return { data, getItemAsync: async (k:string) => data.get(k) ?? null, setItemAsync: async (k:string,v:string) => { data.set(k,v); }, deleteItemAsync: async (k:string) => { data.delete(k); } };
}
test("draft restore isolates accounts and round-trips partial setup without other fields", async () => {
 const storage = memory(); const store = createSetupDraftStore(storage);
 await store.write(a, draft()); await store.write(b,draft("Calgary"));
 assert.equal((await store.read(a))?.form.city,"Toronto");
 assert.equal((await store.read(b))?.form.city,"Calgary");
 await store.clear(a); assert.equal(await store.read(a),null);
 assert.equal((await store.read(b))?.form.city,"Calgary");
 const raw = {...draft(), password:"never persist", form:{...draft().form, secret:"no"}};
 assert.equal(JSON.stringify(parseSetupDraft(JSON.stringify(raw))).includes("secret"),false);
 assert.throws(() => store.read("../account"),/Invalid account/);
});
test("stale malformed oversized and unsupported drafts cannot hydrate setup", () => {
 for(const raw of ["{",JSON.stringify({...draft(),updatedAt:Date.now()-8*86400000}),JSON.stringify({...draft(),version:2}),JSON.stringify({...draft(),goal:"other"}),JSON.stringify({...draft(),phase:"choose"}),JSON.stringify({...draft(),form:{...draft().form,city:42}}),"x".repeat(4001)])
  assert.equal(parseSetupDraft(raw),null);
});
test("queued edits cannot overwrite clear or newer saved input", async () => {
 const storage=memory(); let release!:()=>void; let entered!:()=>void;
 const started=new Promise<void>(r=>entered=r); const blocked=new Promise<void>(r=>release=r);
 let first=true;
 const store=createSetupDraftStore({...storage,setItemAsync:async(k,v)=>{if(first){first=false;entered();await blocked;}await storage.setItemAsync(k,v);}});
 const one=store.write(a,draft("Old"));await started;
 const two=store.write(a,draft("New")); const clear=store.clear(a);
 release();await Promise.all([one,two,clear]);assert.equal(await store.read(a),null);
 await store.write(a,draft("Latest")); assert.equal((await store.read(a))?.form.city,"Latest");
});
test("storage failure remains visible and next save recovers", async () => {
 const storage=memory();let fail=true;
 const store=createSetupDraftStore({...storage,setItemAsync:async(k,v)=>{if(fail)throw Error("disk");await storage.setItemAsync(k,v);}});
 await assert.rejects(store.write(a,draft()),/disk/);fail=false;
 await store.write(a,draft());assert.equal((await store.read(a))?.goal,"bills");
});
test("resume reconciles an uncertain save but never diverts a joined or different household", () => {
 assert.equal(shouldResumeSetup({...draft(),phase:"saving"},a,"owner"),true);
 assert.equal(shouldResumeSetup({...draft(),phase:"saving"},a,"member"),false);
 assert.equal(shouldResumeSetup({...draft(),phase:"choose",homeId:a},b,"owner"),false);
 assert.equal(shouldResumeSetup({...draft(),phase:"choose",homeId:a},a,"owner"),true);
 assert.equal(shouldResumeSetup(draft(),a,"owner"),false);
 assert.equal(shouldResumeSetup(null,a,"owner"),false);
});
test("corrupt persisted drafts are removed and read failures are not mistaken for empty",async()=>{
 const storage=memory();const store=createSetupDraftStore(storage);
 storage.data.set("rezlee.setup.v1."+a,"broken");assert.equal(await store.read(a),null);assert.equal(storage.data.size,0);
 await assert.rejects(createSetupDraftStore({...storage,getItemAsync:async()=>{throw Error("unavailable");}}).read(a),/unavailable/);
});
