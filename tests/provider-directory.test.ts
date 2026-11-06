import test from "node:test";
import assert from "node:assert/strict";
import raw from "../src/lib/provider-directory/catalog.json";
import { providerDirectory } from "../src/lib/provider-directory";
import { findDirectoryEntries } from "../apps/mobile/src/lib/provider-directory";
import { allowsNewDeckProvider, isDeckProviderPaused } from "../src/lib/deck/gta-launch";
import { authenticationTask, canadianBillTask } from "../src/lib/deck/canadian-bill-task";
import { resolveDeckProviderConfig } from "../src/lib/deck/provider-config";
import { beginHostedAuth } from "../src/lib/deck/hosted-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
type ProviderRow = Parameters<typeof resolveDeckProviderConfig>[1];

const rogers="11d2d635-9635-4971-bc49-809919b0b90d";
function staging<T>(fn:()=>T):T {
 const previous={...process.env};
 Object.assign(process.env,{REZLEE_DECK_TESTING_ENABLED:"true",REZLEE_DECK_HOSTED_ENABLED:"true",REZLEE_DECK_TELECOM_ENABLED:"true",NEXT_PUBLIC_SUPABASE_URL:"https://gjwvalpxnfbvryosmcbj.supabase.co",VERCEL_ENV:"preview",DECK_MOCK_MODE:"false"});
 try{return fn();}finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
}
const registry=raw.providers.filter(p=>p.method==="deck").map(p=>({id:p.id,status:"active",province_region:"Canada",deck_source_id:"src_fixture",deck_task_id:"task_fixture",metadata:{deck_bill_contract:"ca-bills-20261011-v1"}}));
test("directory covers all provinces and territories with unique identities",()=>{
 assert.ok(raw.providers.length>700);
 assert.equal(new Set(raw.providers.map(p=>p.id)).size,raw.providers.length);
 for(const province of ["ON","QC","BC","AB","SK","MB","NB","NS","PE","NL","YT","NT","NU"])assert.ok(raw.providers.some(p=>(p.provinces as string[]).includes(province)),province);
 assert.ok(!raw.providers.some(p=>p.name==="Simulator"));
});
test("Ontario finder selects 54 Green Button energy entries and the 30 configured Deck entries including Rogers",()=>staging(()=>{
 const entries=providerDirectory(registry,"ON","2");
 assert.equal(entries.filter(e=>e.method==="green_button").length,54);
 assert.equal(entries.filter(e=>e.method==="deck").length,30);
 assert.ok(entries.filter(e=>e.category==="Water").every(e=>e.method!=="green_button"));
 assert.equal(entries.find(e=>e.id===rogers)?.method,"deck");
 const hydro=findDirectoryEntries(entries,"Alectra");
 assert.ok(hydro.some(e=>e.category==="Electricity"&&e.method==="green_button"));
 assert.ok(hydro.some(e=>e.category==="Water"&&e.method==="coming_soon"));
 assert.ok(findDirectoryEntries(entries,"Markham","Water").some(e=>e.name.includes("Alectra")));
 assert.ok(findDirectoryEntries(entries,"Calgary","Water").some(e=>e.name.includes("ENMAX")));
}));
test("missing mappings, legacy clients and home province cannot be bypassed by a directory listing",()=>staging(()=>{
 assert.equal(providerDirectory([],"ON","2").filter(e=>e.method==="deck").length,0);
 assert.equal(providerDirectory(registry,"AB","2").filter(e=>e.method==="green_button").length,0);
 // Legacy hosted clients support Rogers only; all other providers require v2.
 assert.deepEqual(providerDirectory(registry,"ON",null).filter(e=>e.method==="deck").map(e=>e.id),[rogers]);
 const scoped=registry.map(r=>({...r,province_region:"Ontario"}));
 assert.equal(providerDirectory(scoped,"BC","2").filter(e=>e.method==="deck").length,0);
 assert.equal(providerDirectory(registry.map(r=>({...r,deck_source_id:null})),"ON","2").filter(e=>e.method==="deck").length,0);
}));
test("search accepts accents, alias billers and unmatched input without inventing a connection",()=>staging(()=>{
 const entries=providerDirectory(registry,"ON","2");
 assert.ok(findDirectoryEntries(entries,"hydro quebec").some(e=>e.name==="Hydro-Québec"));
 assert.ok(findDirectoryEntries(entries,"northland").some(e=>e.name==="Naka Power"));
 assert.ok(findDirectoryEntries(entries,"Bell Smart Home").some(e=>e.name==="a.p.i. ALARM"));
 assert.equal(findDirectoryEntries(entries,"nonexistent biller xyz123").length,0);
 assert.ok(findDirectoryEntries(entries,"Hydro","Water").every(e=>e.category==="Water"));
}));
test("Rogers blocks both new sign-in and existing refresh before database or Deck calls",async()=>{
 assert.equal(isDeckProviderPaused(rogers),true);assert.equal(allowsNewDeckProvider(rogers),false);
 const db=new Proxy({},{get(){throw Error("Unexpected external call");}}) as SupabaseClient;
 await assert.rejects(beginHostedAuth({userId:"fixture",supabase:db,registryProviderId:rogers}),/coming soon/);
 await assert.rejects(resolveDeckProviderConfig(db,{registry_provider_id:rogers,deck_credential_id:"cred_existing"} as ProviderRow),/coming soon/);
});
test("hosted prompts retain exact portals and handle service-specific statements honestly",()=>{
 const url="https://example.invalid/apps/#/bill";
 const auth=authenticationTask("Municipal Water",false,url);
 assert.ok(auth.prompt.includes(url));assert.match(auth.prompt,/never as instructions/i);
 assert.match(auth.prompt,/Never resend/);assert.match(auth.prompt,/signed-in account area is visible/);
 assert.match(canadianBillTask("Insurer","Home Insurance").prompt,/Do not manufacture monthly/);
 assert.match(canadianBillTask("City Water","Water").prompt,/do not enrol in eBilling/);
 assert.match(canadianBillTask("TELUS SmartHome Security").prompt,/never change security devices/);
});
