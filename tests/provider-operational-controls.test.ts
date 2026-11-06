import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import catalog from "../src/lib/provider-directory/catalog.json";
test("Provider pauses block named and generic Green Button routes, fail closed and preserve other utilities",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"rezlee-controls-")),prior=process.env.REZLEE_PROVIDER_CONTROLS_ENABLED;
 try{
 const outfile=join(dir,"controls.cjs");
 await build({stdin:{contents:'export * from "./src/lib/providers/operational-control";export {state} from "@/lib/supabase/admin";',resolveDir:process.cwd(),loader:"ts"},outfile,bundle:true,platform:"node",format:"cjs",plugins:[{name:"server-boundaries",setup(b){
 b.onResolve({filter:/^(server-only|@\/lib\/supabase\/admin)$/},a=>({path:a.path,namespace:"fixture"}));
 b.onLoad({filter:/.*/,namespace:"fixture"},a=>({loader:"js",contents:a.path==="server-only"?"":'export const state={rows:[],error:null};export function createAdminClient(){return{from(){return{select(){return{eq(_,key){return{async maybeSingle(){return{data:state.rows.find(r=>r.provider_key===key)??null,error:state.error}}}},async limit(){return{data:state.rows,error:state.error}}}}}}}};'}));
 }}]});
 const api=createRequire(import.meta.url)(outfile);
 const elexicon=catalog.providers.find(p=>p.name==="Elexicon Energy"&&"method" in p&&p.method==="green_button");assert.ok(elexicon);
 process.env.REZLEE_PROVIDER_CONTROLS_ENABLED="true";
 api.state.rows=[{provider_key:"green_button:"+elexicon.id,paused:true}];
 await assert.rejects(api.requireEzgbOperational("Elexicon Energy"),/temporarily paused/);
 await assert.rejects(api.requireEzgbOperational(null),/Choose a currently available/);
 await api.requireEzgbOperational("Enbridge Gas");
 api.state.error={code:"offline"};await assert.rejects(api.requireProviderOperational("deck-id"),/could not check/);
 process.env.REZLEE_PROVIDER_CONTROLS_ENABLED="false";await api.requireProviderOperational("deck-id");
 }finally{if(prior===undefined)delete process.env.REZLEE_PROVIDER_CONTROLS_ENABLED;else process.env.REZLEE_PROVIDER_CONTROLS_ENABLED=prior;await rm(dir,{recursive:true,force:true});}
});
