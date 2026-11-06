import test from "node:test";
import assert from "node:assert/strict";
import {deckAdmissionPolicy,deckAdmission,requireDeckAdmission} from "../src/lib/deck/admission";
// Bell is in the GTA catalogue; these admission tests still use synthetic portal and task values.
const registry={id:"fc092591-8083-4e58-aaab-8f34e4435e0b",status:"active",website_url:"https://provider.example/login",deck_source_id:"src_verified",deck_task_id:"task_verified",deck_agent_id:"agt_verified"};
const approved={registryId:registry.id,websiteUrl:registry.website_url,sourceId:registry.deck_source_id,taskId:registry.deck_task_id,agentId:registry.deck_agent_id};
const env={REZLEE_DECK_LAUNCH_PROVIDERS:JSON.stringify([approved])};
test("public Deck admission defaults closed even for an active registry entry",()=>{
 assert.equal(deckAdmission(registry,deckAdmissionPolicy({})).allowed,false);assert.equal(deckAdmission(null,deckAdmissionPolicy(env)).allowed,false);
 assert.throws(()=>requireDeckAdmission(registry,deckAdmissionPolicy({})),/not available/);
});
test("only the pinned identity, portal and source/task mapping can connect",()=>{
 const policy=deckAdmissionPolicy(env);assert.equal(deckAdmission(registry,policy).allowed,true);
 for(const changed of [{...registry,id:"22222222-2222-4222-8222-222222222222"},{...registry,status:"needs_mapping"},{...registry,website_url:"https://provider.example.evil.test/login"},{...registry,website_url:"https://provider.example/other"},{...registry,deck_source_id:"src_other"},{...registry,deck_task_id:"task_other"},{...registry,deck_agent_id:null}])assert.equal(deckAdmission(changed,policy).allowed,false);
});
test("invalid or duplicated release configuration cannot silently enable a partial allowlist",()=>{
 for(const value of ["{",JSON.stringify([approved,approved]),JSON.stringify([{...approved,websiteUrl:"http://provider.example/login"}]),JSON.stringify([{...approved,websiteUrl:"https://secret@provider.example/login"}]),JSON.stringify([{...approved,taskId:null}])])assert.deepEqual(deckAdmissionPolicy({REZLEE_DECK_LAUNCH_PROVIDERS:value}).providers,[]);
});
test("staging test override is explicit, isolated and disabled for a production deployment",()=>{
 const testEnv={REZLEE_DECK_TESTING_ENABLED:"true",NEXT_PUBLIC_SUPABASE_URL:"https://gjwvalpxnfbvryosmcbj.supabase.co",VERCEL_ENV:"preview"};
 assert.equal(deckAdmission(null,deckAdmissionPolicy(testEnv)).allowed,true);
 assert.equal(deckAdmission(registry,deckAdmissionPolicy({...testEnv,VERCEL_ENV:"production"})).allowed,false);
 assert.equal(deckAdmission(registry,deckAdmissionPolicy({...testEnv,NEXT_PUBLIC_SUPABASE_URL:"https://other.supabase.co"})).allowed,false);
 assert.equal(deckAdmission(registry,deckAdmissionPolicy({...testEnv,REZLEE_DECK_TESTING_ENABLED:"false"})).allowed,false);
 assert.equal(deckAdmission({...registry,status:"unsupported"},deckAdmissionPolicy(testEnv)).allowed,false);
});

test("runtime blocks unmapped and changed provider configuration before any Deck request",async()=>{
 const {resolveDeckProviderConfig}=await import("../src/lib/deck/provider-config");
 const before=process.env.REZLEE_DECK_LAUNCH_PROVIDERS,testBefore=process.env.REZLEE_DECK_TESTING_ENABLED;
 process.env.REZLEE_DECK_LAUNCH_PROVIDERS=JSON.stringify([approved]);delete process.env.REZLEE_DECK_TESTING_ENABLED;
 let requests=0;const fetchBefore=globalThis.fetch;globalThis.fetch=async()=>{requests++;throw Error("Unexpected external request");};
 const db=(row:unknown)=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error:null})})})})}) as unknown as Parameters<typeof resolveDeckProviderConfig>[0];
 const provider={id:registry.id,name:"Example",registry_provider_id:registry.id,deck_connection_metadata:{sourceId:"src_injected",taskId:"task_injected"}} as unknown as Parameters<typeof resolveDeckProviderConfig>[1];
 try{
  await assert.rejects(resolveDeckProviderConfig(db(null),{...provider,registry_provider_id:null}),/not available/);
  await assert.rejects(resolveDeckProviderConfig(db({...registry,deck_task_id:"task_changed"}),provider),/not available/);
  const config=await resolveDeckProviderConfig(db({...registry,name:"Example",utility_type:"Internet"}),provider);
  assert.equal(config.sourceId,approved.sourceId);assert.equal(config.taskId,approved.taskId);assert.equal(requests,0);
 }finally{globalThis.fetch=fetchBefore;if(before===undefined)delete process.env.REZLEE_DECK_LAUNCH_PROVIDERS;else process.env.REZLEE_DECK_LAUNCH_PROVIDERS=before;if(testBefore===undefined)delete process.env.REZLEE_DECK_TESTING_ENABLED;else process.env.REZLEE_DECK_TESTING_ENABLED=testBefore;}
});

test("legacy connection, credential and refresh entry points reject public calls before any network access", async()=>{
 const saved={testing:process.env.REZLEE_DECK_TESTING_ENABLED,mock:process.env.DECK_MOCK_MODE};
 delete process.env.REZLEE_DECK_TESTING_ENABLED;delete process.env.DECK_MOCK_MODE;
 let requests=0;const before=globalThis.fetch;
 globalThis.fetch=async()=>{requests++;throw Error("Unexpected network request");};
 try{
  const legacy=await import("../src/lib/sync/provider-sync");
  const input={providerId:registry.id,userId:registry.id};
  await assert.rejects(legacy.createProviderConnectionSession(input),/not available/);
  await assert.rejects(legacy.createProviderDeckCredential({...input,username:"synthetic",password:"synthetic"}),/not available/);
  await assert.rejects(legacy.syncProvider(input),/not available/);
  assert.equal(requests,0);
 }finally{
  globalThis.fetch=before;
  if(saved.testing===undefined)delete process.env.REZLEE_DECK_TESTING_ENABLED;else process.env.REZLEE_DECK_TESTING_ENABLED=saved.testing;
  if(saved.mock===undefined)delete process.env.DECK_MOCK_MODE;else process.env.DECK_MOCK_MODE=saved.mock;
 }
});
