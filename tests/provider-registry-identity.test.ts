import test from "node:test";
import assert from "node:assert/strict";
import { canonicalRegistryId, registryIdentityMap } from "../src/lib/deck/registry-identity";
import { providerDirectory } from "../src/lib/provider-directory";
import { allowsNewDeckProvider, isDeckProviderPaused } from "../src/lib/deck/gta-launch";
const bell="fc092591-8083-4e58-aaab-8f34e4435e0b",productionBell="95391dbe-2675-4f97-a139-2708795eb7c5";
test("deployment identity maps preserve existing production records and do not open unknown providers",()=>{
 const before=process.env.REZLEE_PROVIDER_REGISTRY_IDENTITIES;
 process.env.REZLEE_PROVIDER_REGISTRY_IDENTITIES=JSON.stringify({[bell]:productionBell});
 try{
  assert.equal(canonicalRegistryId(productionBell),bell);
  assert.equal(allowsNewDeckProvider(productionBell),true);
  assert.equal(allowsNewDeckProvider("unknown"),false);
  assert.equal(isDeckProviderPaused("11d2d635-9635-4971-bc49-809919b0b90d"),true);
  const directory=providerDirectory([{id:productionBell,province_region:"Canada"}],"ON","2");
  const row=directory.find(p=>p.name==="Bell");
  assert.equal(row?.registryProviderId,productionBell);
  assert.equal(row?.method,"coming_soon","mapping alone must not bypass launch admission or missing tasks");
 }finally{if(before===undefined)delete process.env.REZLEE_PROVIDER_REGISTRY_IDENTITIES;else process.env.REZLEE_PROVIDER_REGISTRY_IDENTITIES=before;}
});
test("ambiguous, malformed or cross-provider identity configurations are rejected",()=>{
 for(const value of ["null","[]","not json",JSON.stringify({[bell]:"not-a-uuid"}),JSON.stringify({[bell]:productionBell,["11111111-1111-4111-8111-111111111111"]:productionBell}),JSON.stringify({[bell]:productionBell,[productionBell]:bell})])
  assert.equal(registryIdentityMap({REZLEE_PROVIDER_REGISTRY_IDENTITIES:value}).size,0);
 assert.equal(canonicalRegistryId(bell,{}),bell);
});
