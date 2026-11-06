import test from "node:test";
import assert from "node:assert/strict";
import { providerFinderResults, type ProviderDirectoryEntry } from "../apps/mobile/src/lib/provider-directory";
const rows:ProviderDirectoryEntry[]=[
 {id:"energy",name:"Alectra Utilities",category:"Electricity",provinces:["ON"],aliases:[],method:"green_button"},
 {id:"water",name:"Alectra Utilities",category:"Water",provinces:["ON"],aliases:[],method:"coming_soon"},
 {id:"bell",name:"Bell",category:"Phone & internet",provinces:["ON"],aliases:["Bell Canada"],method:"deck",registryProviderId:"bell-id"},
 {id:"rogers",name:"Rogers",category:"Phone & internet",provinces:["ON"],aliases:[],method:"coming_soon"},
];
test("browsing prioritizes usable connections without hiding unavailable providers from search",()=>{
 assert.deepEqual(providerFinderResults(rows,"").map(p=>p.id),["energy","bell"]);
 assert.deepEqual(providerFinderResults(rows,"rogers").map(p=>p.id),["rogers"]);
 assert.equal(providerFinderResults(rows,"","All",true).length,4);
 assert.equal(providerFinderResults(rows,"","Water").length,0);
 assert.deepEqual(providerFinderResults(rows,"alectra","Water").map(p=>p.id),["water"]);
 assert.deepEqual(providerFinderResults(rows,"alectra","Energy").map(p=>p.id),["energy"]);
 assert.deepEqual(providerFinderResults(rows,"Bell Canada","Phone & internet").map(p=>p.id),["bell"]);
});
