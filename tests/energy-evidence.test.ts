import {buildEnergyBillStory} from "../apps/mobile/src/lib/energy-bill-story";
import {manualHistoryAccounts,type HistoryBill} from "../apps/mobile/src/lib/manual-history-insights";
import test from "node:test";
import assert from "node:assert/strict";
import {energyEvidenceError,parseEnergyEvidence,suggestedEnergyEvidence,summarizeEnergyEvidence,compareEnergyEvidence,printedTimeBands,type EnergyLine,type EnergyEvidence} from "../apps/mobile/src/lib/energy-evidence";
import {extractedIntakeEvidence,mergeIntakeEvidence,parseIntakeEvidence,intakeEvidencePayload} from "../apps/mobile/src/lib/statement-intake-evidence";
import {statementEvidenceSuggestions} from "../apps/mobile/src/lib/statement-suggestions";
import {parseStatementBatch,emptyStatementFields} from "../apps/mobile/src/lib/statement-batch-core";
import {parseStatementDraft} from "../apps/mobile/src/lib/statement-draft-core";
import {statementUploadForm} from "../apps/mobile/src/lib/statement-upload-form";
import {currentReviewedEnergyEvidence,saveStatementEvidence} from "../src/lib/product/statement-evidence";
import {evidenceDefaults} from "../apps/mobile/src/lib/statement-evidence";

const line=(patch:Partial<EnergyLine>={}):EnergyLine=>({label:"Off-peak",kind:"energy",amount:"24",quantity:"300",unit:"kWh",rate:"8.00000",rateUnit:"cents/kWh",band:"off_peak",quote:"Off-peak 300 kWh at 8.00000 cents/kWh 24.00",...patch});
const energy=():EnergyEvidence=>({version:1,service:"electricity",scope:"single_service",lines:[line(),line({label:"On-peak",amount:"16",quantity:"100",rate:"16",band:"on_peak"}),line({label:"Delivery",kind:"delivery",amount:"40",quantity:"",unit:"",rate:"",rateUnit:"",band:""}),line({label:"Tax",kind:"tax",amount:"10.40",quantity:"",unit:"",rate:"",rateUnit:"",band:""}),line({label:"Rebate",kind:"credit",amount:"-5.40",quantity:"",unit:"",rate:"",rateUnit:"",band:""})]});
const raw=()=>({document_kind:"statement",currency:"CAD",billing_period_start:"2026-08-01",billing_period_end:"2026-08-31",supporting_details:{usage:{value:"400",quote:"Total 400 kWh"},unit:{value:"kWh",quote:"Total 400 kWh"},reading:{value:"actual",quote:"Actual reading"},amountDue:{value:"285",quote:"Amount due 285.00"}},supporting_energy:energy()});
const id="11111111-1111-4111-8111-111111111111";

test("printed rates retain precision and units; unsupported data is rejected",()=>{
 assert.deepEqual(parseEnergyEvidence(energy()),energy());
 assert.equal(parseEnergyEvidence(energy())?.lines[0].rate,"8.00000");
 for(const patch of [{amount:"1e3"},{quantity:"1,000"},{rate:"0.1234567891"},{rateUnit:"CAD/Wh"},{quantity:"",unit:"kWh"},{kind:"credit",amount:"5"},{label:""},{quote:"x".repeat(161)}])assert.ok(energyEvidenceError({...energy(),lines:[{...line(),...patch}]}));
 assert.ok(parseEnergyEvidence({...energy(),lines:[line({amount:"0",quantity:"0",rate:"0"})]}));
 assert.equal(parseEnergyEvidence({...energy(),lines:Array(17).fill(line())}),null);
});

test("unknown currency, document kind, period and missing quotes do not introduce monetary claims",()=>{
 const unconfirmed=suggestedEnergyEvidence(energy(),null)!;
 assert.equal(unconfirmed.lines.length,2);assert.equal(unconfirmed.lines[0].amount,"");assert.equal(unconfirmed.lines[0].rate,"");assert.equal(unconfirmed.lines[0].quantity,"300");
 assert.equal(suggestedEnergyEvidence({...energy(),lines:[line({quote:""})]},"CAD"),null);
 assert.equal(extractedIntakeEvidence({...raw(),document_kind:"other"}).energy,undefined);
 const r=statementEvidenceSuggestions({documentKind:"statement",currency:"CAD",periodStart:"2026-07-01",periodEnd:"2026-07-31",energy:energy()},{periodStart:"2026-08-01",periodEnd:"2026-08-31"});assert.equal(r.energy,undefined);
});

test("only complete, reconciled single-service lines become an additive charge explanation",()=>{
 const complete=summarizeEnergyEvidence(energy(),8500)!;assert.equal(complete.matched,true);assert.equal(complete.groups.reduce((n,g)=>n+g.minor,0),8500);assert.equal(complete.groups.find(g=>g.kind==="credit")?.minor,-540);
 for(const e of [{...energy(),scope:"net_metering"},{...energy(),scope:"mixed_or_unclear"},{...energy(),lines:[...energy().lines,line()]},{...energy(),lines:[line({amount:""})]}]){
  const s=summarizeEnergyEvidence(e as EnergyEvidence,8500)!;assert.equal(s.matched,false);assert.deepEqual(s.groups,[]);
 }
 assert.equal(summarizeEnergyEvidence(energy(),28500)?.matched,false); // amount due never substitutes for period charges
 assert.equal(summarizeEnergyEvidence({...energy(),lines:[]},0),null);
});

test("changes reconcile exactly; rate comparisons require the same printed unit and line identity",()=>{
 const old=energy(),latest=energy();latest.lines[0]={...latest.lines[0],amount:"27",rate:"9"};latest.lines[4].amount="-6.40";
 const result=compareEnergyEvidence(latest,old,8700,8500)!;assert.equal(result.totalChange,200);assert.equal(result.groups.reduce((n,g)=>n+g.change,0),200);assert.deepEqual(result.rates,[{label:"Off-peak",previous:"8.00000",current:"9",unit:"cents/kWh"}]);
 latest.lines[0].rateUnit="CAD/kWh";assert.equal(compareEnergyEvidence(latest,old,8700,8500)?.rates.length,0);
 assert.equal(compareEnergyEvidence(latest,old,9999,8500),null);
 assert.equal(compareEnergyEvidence(latest,{...old,service:"gas"},8700,8500),null);
});

test("time bands must uniquely reconcile to actual printed total with decimal-safe arithmetic",()=>{
 assert.deepEqual(printedTimeBands(energy(),"400","kWh")?.map(b=>b.percent),[75,25]);
 for(const total of ["0","399.99","1e3",""])assert.equal(printedTimeBands(energy(),total,"kWh"),null);
 assert.equal(printedTimeBands({...energy(),scope:"net_metering"},"400","kWh"),null);
 assert.equal(printedTimeBands({...energy(),lines:[line(),line()]},"600","kWh"),null);
 const decimal={...energy(),lines:[line({quantity:"0.1"}),line({band:"on_peak",quantity:"0.2"})]};assert.ok(printedTimeBands(decimal,"0.3","kWh"));
 assert.equal(printedTimeBands(energy(),"400","GJ"),null);
});

test("extraction, correction, single/batch restart and multipart preserve energy with the original",async()=>{
 const evidence=extractedIntakeEvidence(raw());assert.deepEqual(evidence.energy,energy());
 const edited={...evidence,energy:{...energy(),lines:energy().lines.map((r,i)=>i===0?{...r,rate:"8.1",quote:""}:r)},energyEdited:true};
 assert.deepEqual(mergeIntakeEvidence(edited,evidence),{...edited,edited:undefined});
 const fields={...emptyStatementFields,bill_title:"Synthetic energy",provider_name:"Example Hydro",category:"Electricity",account_number:"Home",amount:"85",billing_period_start:"2026-08-01",billing_period_end:"2026-08-31"};
 assert.deepEqual(parseStatementDraft(JSON.stringify({version:1,updatedAt:Date.now(),homeId:id,fileName:"bill.pdf",fields:{...fields,record_kind:"historical"},evidence:edited}))?.evidence,edited);
 const batch={version:1,revision:0,homeId:id,homeName:"Synthetic test",items:[{requestId:id,name:"bill.pdf",status:"review",readAttempted:true,fields,evidence:edited}]};
 assert.deepEqual(parseStatementBatch(JSON.stringify(batch))?.items[0].evidence,edited);
 const body=await new Response(statementUploadForm({fields,evidence:edited,requestId:id,homeId:id,file:new Blob(["synthetic original"],{type:"application/pdf"})})).formData();
 const saved=JSON.parse(body.get("supporting_details") as string);assert.deepEqual(saved.energy,edited.energy);assert.equal(saved.energyEdited,undefined);assert.equal(body.getAll("supporting_details").length,1);assert.equal(body.get("amount"),"85");assert.equal(saved.fields.amountDue,"285");assert.equal(await (body.get("file") as Blob).text(),"synthetic original");
 const cleared={...edited,energy:undefined};assert.equal(mergeIntakeEvidence(cleared,evidence).energy,undefined);
});

test("invalid edits survive draft recovery but cannot silently disappear into a save",()=>{
 const invalid={...extractedIntakeEvidence(raw()),energy:{...energy(),lines:[line({rate:"."})]}};
 assert.ok(parseIntakeEvidence(invalid,true));assert.equal(parseIntakeEvidence(invalid),null);assert.throws(()=>intakeEvidencePayload(invalid),/Check/);
});

function savedRow(){const basis={amount:85,start:"2026-08-01",end:"2026-08-31",provider:"Example Hydro",account:"Home",category:"Electricity"};return {id,source:"manual",status:"archived",currency:"CAD",amount:85,billing_period_start:basis.start,billing_period_end:basis.end,custom_provider_name:basis.provider,account_number_masked:basis.account,updated_at:"2026-09-01T00:00:00Z",original_document_id:id,raw_data:{category:basis.category,record_kind:"historical",amount_basis:"period_charges",statement_evidence:{...evidenceDefaults},statement_evidence_basis:basis,statement_evidence_reviewed_at:"2026-09-01T00:00:00Z",statement_energy_evidence:energy(),statement_energy_basis:basis,statement_energy_reviewed_at:"2026-09-01T00:00:00Z"}};}

test("corrected account identity/period/charges invalidate energy until separately reviewed",()=>{
 const row=savedRow();assert.deepEqual(currentReviewedEnergyEvidence(row),energy());
 for(const patch of [{amount:86},{currency:"USD"},{billing_period_end:"2026-08-30"},{custom_provider_name:"Other"},{account_number_masked:"Other"}])assert.equal(currentReviewedEnergyEvidence({...row,...patch}),null);
 const changed={...row,amount:86,raw_data:{...row.raw_data,statement_evidence_basis:{...row.raw_data.statement_evidence_basis,amount:86}}};assert.equal(currentReviewedEnergyEvidence(changed),null);
});

test("older client's supporting-details save preserves energy and cannot revalidate a stale energy basis",async()=>{
 const row=savedRow();row.amount=86;let update:Record<string,unknown>={};
 const select={eq:()=>select,maybeSingle:async()=>({data:row,error:null})};
 const write={eq:()=>write,select:()=>write,maybeSingle:async()=>({data:{updated_at:"new-version"},error:null})};
 const supabase={from:()=>({select:()=>select,update:(v:Record<string,unknown>)=>{update=v;return write;}})};
 const result=await saveStatementEvidence({supabase,userId:id,homeId:id} as unknown as Parameters<typeof saveStatementEvidence>[0],id,row.updated_at,{...evidenceDefaults,tax:"10.4"});
 assert.ok("payload" in result);const raw=update.raw_data as typeof row.raw_data;assert.deepEqual(raw.statement_energy_evidence,energy());assert.equal(raw.statement_energy_basis.amount,85);assert.equal(raw.statement_evidence_basis.amount,86);assert.equal(currentReviewedEnergyEvidence({...row,raw_data:raw}),null);
});


test("saved energy flows into one-bill breakdown, history changes and safe mixed-meter guidance",()=>{
 const current:HistoryBill={id:"current",label:"Synthetic electricity",providerName:"Example Hydro",providerId:null,category:"Electricity",categoryId:"electricity",accountNumber:"Example",currency:"CAD",source:"manual",isHistoricalStatement:true,amount:85,billingPeriodStart:"2026-08-01",billingPeriodEnd:"2026-08-31",reviewedEvidence:{...evidenceDefaults,usage:"400",unit:"kWh",reading:"actual"},reviewedEnergyEvidence:energy()};
 const story=(rows:HistoryBill[])=>buildEnergyBillStory(manualHistoryAccounts(rows)[0],{today:"2026-09-01",complete:true});
 const one=story([current]);assert.equal(one.energySummary?.matched,true);assert.equal(one.timeBands?.length,2);assert.equal(one.next.action,"add");
 const previous={...current,id:"previous",billingPeriodStart:"2026-07-01",billingPeriodEnd:"2026-07-31"};
 assert.equal(story([current,previous]).energyChanges?.totalChange,0);
 const mixed={...current,reviewedEnergyEvidence:{...energy(),scope:"net_metering" as const}};
 const safe=story([mixed,previous]);assert.equal(safe.usage,null);assert.equal(safe.change?.usage,null);assert.equal(safe.timeBands,null);assert.equal(safe.energySummary?.matched,false);assert.equal(safe.next.title,"Read net metering separately");
 assert.equal(story([{...current,reviewedEnergyEvidence:null}]).energySummary,null);
 assert.equal(story([{...current,categoryId:"gas",category:"Gas"}]).energySummary,null);
});
