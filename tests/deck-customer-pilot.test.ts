import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {historyMonths,historyRange} from "../src/lib/deck/history-range";
import {telecomImportPlan,telecomBillRows,telecomCoverage,telecomOutcome} from "../src/lib/deck/telecom-import";
import {hostedClientCompatible} from "../src/lib/deck/hosted-auth-policy";
import {deckAdmission,deckAdmissionPolicy} from "../src/lib/deck/admission";

test("customer history bounds reject malformed choices and clip leap/month-end dates",()=>{
 for(const value of [0,13,-1,1.5,"6",null,NaN,Infinity]) assert.throws(()=>historyMonths(value));
 for(let months=1;months<=12;months++){
  const plan=telecomImportPlan({registryId:null,taskId:"unused",historyTaskId:"history",authenticationTaskId:"auth",historyMonths:months},new Date("2026-10-11T12:00:00Z"));
  assert.deepEqual(plan.phases.map(p=>p.kind),["authenticate","history"]);
  assert.deepEqual(plan.phases[1].input,historyRange(months,new Date("2026-10-11T12:00:00Z")));
 }
 assert.deepEqual(historyRange(1,new Date("2024-03-31T12:00:00Z")),{since_date:"2024-02-29",until_date:"2024-03-31"});
 assert.deepEqual(historyRange(1,new Date("2025-03-31T12:00:00Z")),{since_date:"2025-02-28",until_date:"2025-03-31"});
});

test("six months of quarterly bills is complete with two verified statements, not six",()=>{
 const range={since_date:"2026-04-11",until_date:"2026-10-11"};
 const output={accounts:[{account_id:"123456"}],bills:[{account_id:"123456",bill_date:"2026-05-01"},{account_id:"123456",bill_date:"2026-08-01"}],coverage:[{account_id:"123456",...range,status:"complete",listed_bill_count:2,missing_bill_dates:[]}]};
 assert.equal(telecomCoverage(output,range,[]).complete,true);
 assert.equal(telecomCoverage({...output,bills:output.bills.slice(0,1)},range,[]).complete,false);
 const empty={...output,bills:[],coverage:[{...output.coverage[0],listed_bill_count:0}]};
 assert.equal(telecomCoverage(empty,range,[]).complete,true);
 assert.match(telecomOutcome(0,true).message,/No issued bills/);
 assert.equal(telecomOutcome(0,false).status,"partial");
 assert.equal(telecomCoverage({...empty,coverage:[{...empty.coverage[0],status:"unavailable"}]},range,[]).complete,false);
});

test("a combined electricity/water statement stays one original bill with no invented payment status",()=>{
 const rows=telecomBillRows({providerName:"Local Hydro",category:"Electricity",taskRunId:"run",providerId:"p",userId:"u",homeId:"h",today:"2026-10-11",phase:"history",output:{bills:[{account_id:"000012345",account_number:"000012345",bill_date:"2026-09-30",statement_amount:127.50,currency:"CAD",service_types:["water","electricity"],autopay_enrolled:true,amount_due:0}]}});
 assert.equal(rows.length,1);assert.equal(rows[0].raw_data.category,"Utility bundle");
 assert.equal(rows[0].payment_status,null);assert.equal(rows[0].status,"archived");
 assert.equal((rows[0].raw_data as Record<string,unknown>).telecom_contract,undefined);
});

test("new hosted providers reject old Rogers-only clients and document-only options cannot create connections",()=>{
 const id="11111111-1111-4111-8111-111111111111";
 const env={REZLEE_DECK_HOSTED_ENABLED:"true",REZLEE_DECK_TELECOM_ENABLED:"true",REZLEE_DECK_TESTING_ENABLED:"true",NEXT_PUBLIC_SUPABASE_URL:"https://gjwvalpxnfbvryosmcbj.supabase.co"};
 assert.equal(hostedClientCompatible(id,null,env),false);assert.equal(hostedClientCompatible(id,"2",env),true);
 assert.equal(deckAdmission({id,status:"active",metadata:{deck_document_alternative:true}},deckAdmissionPolicy(env)).allowed,false);
});

test("all GTA municipalities resolve to a biller or an explicit document alternative, with valid custom sign-in forms",()=>{
 const rows=JSON.parse(readFileSync("src/lib/deck/canadian-provider-catalog.json","utf8")) as Array<{name:string;searchAliases:string[];sourceConfig?:{authMethod:string;fields:Record<string,{label:string}>};fallback?:boolean;connectionNote:string}>;
 const water=rows.filter(r=>/water/i.test(r.name+" "+r.searchAliases.join(" ")));
 for(const city of ["Toronto","Mississauga","Brampton","Caledon","Ajax","Pickering","Whitby","Oshawa","Clarington","Scugog","Uxbridge","Brock","Burlington","Oakville","Milton","Halton Hills","Aurora","East Gwillimbury","Georgina","King","Markham","Newmarket","Richmond Hill","Vaughan","Stouffville"])
  assert.ok(water.some(r=>(r.name+" "+r.searchAliases.join(" ")).toLowerCase().includes(city.toLowerCase())),city);
 for(const r of rows){
  if(r.fallback)assert.ok(r.connectionNote.length>20);
  if(r.sourceConfig){assert.equal(r.sourceConfig.authMethod,"source_fields");assert.equal(Array.isArray(r.sourceConfig.fields),false);assert.ok(Object.values(r.sourceConfig.fields).every(f=>f.label.length>0));}
 }
});
