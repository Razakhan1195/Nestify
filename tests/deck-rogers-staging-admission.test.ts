import test from "node:test";
import assert from "node:assert/strict";
import { allowsNewDeckProvider, isDeckProviderPaused, gtaCatalogueEntry } from "../src/lib/deck/gta-launch";
const id="11d2d635-9635-4971-bc49-809919b0b90d";
test("Rogers workflow testing opens only on the isolated staging database",()=>{
 const names=["REZLEE_DECK_TESTING_ENABLED","VERCEL_ENV","NEXT_PUBLIC_SUPABASE_URL"];
 const saved=names.map(k=>process.env[k]);
 try {
  for(const [flag,target,url,allowed] of [
   ["true","preview","https://gjwvalpxnfbvryosmcbj.supabase.co",true],
   ["true","production","https://gjwvalpxnfbvryosmcbj.supabase.co",false],
   ["true","preview","https://eynbuhmtxkigvqoewbwi.supabase.co",false],
   ["false","preview","https://gjwvalpxnfbvryosmcbj.supabase.co",false],
  ] as const){
   process.env.REZLEE_DECK_TESTING_ENABLED=flag;process.env.VERCEL_ENV=target;process.env.NEXT_PUBLIC_SUPABASE_URL=url;
   assert.equal(allowsNewDeckProvider(id),allowed);assert.equal(isDeckProviderPaused(id),!allowed);
   assert.equal(Boolean(gtaCatalogueEntry({id,name:"Rogers",utility_type:"Internet"},false)),allowed);
   assert.equal(allowsNewDeckProvider("3f236e11-3755-41d8-9f60-48dd9d4a0f55"),false);
  }
 } finally {names.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});
