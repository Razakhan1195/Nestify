import test from "node:test";
import assert from "node:assert/strict";
import { allowsNewDeckProvider } from "../src/lib/deck/gta-launch";
import { providerDirectory } from "../src/lib/provider-directory";
import { deckAdmission } from "../src/lib/deck/admission";
const canonical = "11d2d635-9635-4971-bc49-809919b0b90d";
const deployed = "6b88a19e-054e-4809-b90f-87d95daca8dc";
test("production Rogers requires explicit mapped admission and exact registry configuration", () => {
  const names = ["REZLEE_DECK_TESTING_ENABLED","REZLEE_DECK_LAUNCH_PROVIDERS","REZLEE_PROVIDER_REGISTRY_IDENTITIES","VERCEL_ENV","REZLEE_DECK_HOSTED_ENABLED","REZLEE_DECK_TELECOM_ENABLED","DECK_MOCK_MODE"];
  const saved = names.map(k => process.env[k]);
  const approved = { registryId: deployed, websiteUrl: "https://www.rogers.com/consumer/profile/signin", sourceId: "src_lBTe7Vv2YgOPARV8", taskId: "task_lmmK8CCKTs0bfWCr", agentId: "agt_tV6SBXa6k6zotImn" };
  const registry = { id: deployed, status: "active", website_url: approved.websiteUrl, deck_source_id: approved.sourceId, deck_task_id: approved.taskId, deck_agent_id: approved.agentId };
  try {
    process.env.REZLEE_DECK_HOSTED_ENABLED = "true";
    process.env.REZLEE_DECK_TELECOM_ENABLED = "true";
    process.env.DECK_MOCK_MODE = "false";
    process.env.VERCEL_ENV = "production";
    process.env.REZLEE_DECK_TESTING_ENABLED = "true";
    process.env.REZLEE_PROVIDER_REGISTRY_IDENTITIES = JSON.stringify({[canonical]:deployed});
    process.env.REZLEE_DECK_LAUNCH_PROVIDERS = "[]";
    assert.equal(allowsNewDeckProvider(deployed), false);
    assert.equal(deckAdmission(registry).allowed, false);
    process.env.REZLEE_DECK_LAUNCH_PROVIDERS = JSON.stringify([approved]);
    assert.equal(allowsNewDeckProvider(deployed), true);
    assert.equal(deckAdmission(registry).allowed, true);
    const directory = providerDirectory([{...registry, province_region:"Ontario",metadata:{deck_bill_contract:"ca-bills-20261011-v1"}}],"ON","2");
    assert.equal(directory.find(row=>row.name==="Rogers")?.method,"deck");
    assert.equal(deckAdmission({...registry, deck_task_id:"task_unapproved"}).allowed, false);
    assert.equal(deckAdmission({...registry, status:"needs_mapping"}).allowed, false);
    assert.equal(allowsNewDeckProvider("3f236e11-3755-41d8-9f60-48dd9d4a0f55"), false);
  } finally { names.forEach((k,i) => { if(saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); }
});

test("Rogers uses the new workflow while other admitted production providers retain their exact tasks", async () => {
  const { resolveDeckProviderConfig } = await import("../src/lib/deck/provider-config");
  const { BILL_AGENT } = await import("../src/lib/deck/bill-agent");
  const routing = (await import("../src/lib/deck/gta-provider-routing.json")).default;
  const other = routing.providers.find(p => p.route === "deck" && p.id !== canonical)!;
  const names = ["VERCEL_ENV","REZLEE_DECK_TESTING_ENABLED","REZLEE_DECK_LAUNCH_PROVIDERS","REZLEE_PROVIDER_REGISTRY_IDENTITIES","REZLEE_PROVIDER_CONTROLS_ENABLED"];
  const saved = names.map(k => process.env[k]);
  try {
    process.env.VERCEL_ENV = "production";
    process.env.REZLEE_DECK_TESTING_ENABLED = "false";
    process.env.REZLEE_PROVIDER_CONTROLS_ENABLED = "false";
    process.env.REZLEE_PROVIDER_REGISTRY_IDENTITIES = JSON.stringify({[canonical]:deployed});
    for (const id of [deployed, other.id]) {
      const registry = {id, name:id===deployed?"Rogers":other.name, status:"active", utility_type:"Internet", website_url:"https://example.com/login", deck_source_id:"src_approved",deck_task_id:"task_approved",deck_agent_id:"agt_approved",metadata:{deck_bill_contract:"ca-bills-20261011-v1",deck_telecom_history_task_id:"task_history",deck_authentication_task_id:"task_login"}};
      process.env.REZLEE_DECK_LAUNCH_PROVIDERS = JSON.stringify([{registryId:id,websiteUrl:registry.website_url,sourceId:registry.deck_source_id,taskId:registry.deck_task_id,agentId:registry.deck_agent_id}]);
      const db = {from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:registry,error:null})})})})};
      const config = await resolveDeckProviderConfig(db as unknown as Parameters<typeof resolveDeckProviderConfig>[0], {registry_provider_id:id,name:registry.name} as Parameters<typeof resolveDeckProviderConfig>[1]);
      assert.equal(config.sourceId,"src_approved");
      if (id===deployed) {
        assert.equal(config.workflowId,BILL_AGENT.workflowId);
        assert.equal(config.agentId,BILL_AGENT.agentId);
        assert.equal(config.accountExtractionTaskId,BILL_AGENT.accountsTaskId);
      } else {
        assert.equal(config.workflowId,undefined);
        assert.equal(config.agentId,"agt_approved");
        assert.equal(config.authenticationTaskId,"task_login");
        assert.equal(config.telecomHistoryTaskId,"task_history");
      }
    }
  } finally { names.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];}); }
});
