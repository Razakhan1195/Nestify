import assert from "node:assert/strict";
import test from "node:test";
import { initialWindow, gmailCandidateQueries, admitCandidate, prepareEmailText, gmailCheckpointAction } from "../src/lib/email-memory/policy";
import { emailProposalSchema, normalizeEmailProposal, type EmailProposal } from "../src/lib/email-memory/extraction";
import { emailRecordFields, emailBillFields, verifiedProposal, emailAcceptSchema } from "../src/lib/email-memory/review";
import { processEmailCapture } from "../src/lib/email-memory/worker";
import type { SupabaseClient } from "@supabase/supabase-js";
const source="Enbridge statement. Current charges including tax CAD 100.00. Service period 2026-08-01 to 2026-08-31. Account ending 1234.";
const proposal:EmailProposal={category:"utility_bill",confidence:"high",title:"Enbridge gas",summary:"The email reports current charges of CAD 100.00.",evidence:["Current charges including tax CAD 100.00"],
 issued_on:"2026-09-01",expires_on:null,provider:"Enbridge",service:"Gas",account:"1234",period_start:"2026-08-01",period_end:"2026-08-31",period_charges:"100.00",currency:"CAD",due_date:"2026-09-20",missing_detail:null};
test("default search stays inside 30 days and shorter move-in boundary",()=>{
 const now=new Date("2026-10-02T01:00:00Z");
 assert.deepEqual(initialWindow(now),{after:Math.floor(Date.parse("2026-09-02T01:00:00Z")/1000),before:Math.ceil(now.getTime()/1000)});
 assert.equal(initialWindow(now,"2026-09-15").after,Date.parse("2026-09-15T00:00:00Z")/1000);
 assert.deepEqual(initialWindow(now,"2020-01-01"),initialWindow(now));
 assert.deepEqual(initialWindow(now,"2030-01-01"),initialWindow(now));
 assert.equal(initialWindow(new Date("2024-02-29T01:00:00Z")).after,Date.parse("2024-01-30T01:00:00Z")/1000);
});
test("candidate queries narrow categories; exclude spam/social and reject query injection in sender",()=>{
 const q=gmailCandidateQueries({now:new Date("2026-10-02"),categories:["utility_bill","warranty"],excludedSenders:["news@example.com","x@example.com OR newer_than:20y"]});
 assert.equal(q.length,2);assert.ok(q.every(v=>v.includes("after:")&&v.includes("before:")&&v.includes("-in:spam")&&v.includes("-from:news@example.com")));
 assert.ok(q.every(v=>!v.includes("newer_than:20y")));assert.match(q[1],/warranty coverage/);
});
test("500 cap counts distinct candidates and stops; 404 never silently scans all history",()=>{
 const seen=new Set<string>();
 for(let i=0;i<700;i++)assert.equal(admitCandidate("m"+i,seen),i<500);
 assert.equal(seen.size,500);assert.equal(admitCandidate("m1",seen),false);
 assert.equal(gmailCheckpointAction(404),"ask_for_bounded_recovery");assert.equal(gmailCheckpointAction(401),"reconnect");
});
test("manual input rejects code messages, HTML, empty and oversized text before AI",()=>{
 for(const s of ["short","a".repeat(12001),"<html>household text here</html>","Your verification code is 123456 for your home portal"])assert.throws(()=>prepareEmailText(s));
 assert.equal(prepareEmailText("  "+source+"  "),source);
});
test("no invented source quotations or low-confidence output gets through",()=>{
 assert.equal(verifiedProposal({...proposal,evidence:["fictional evidence"]},source),null);
 assert.equal(verifiedProposal({...proposal,confidence:"low"},source),null);
 assert.equal(verifiedProposal({...proposal,category:"unknown"},source),null);
 assert.equal(verifiedProposal(proposal,source)?.evidence.length,1);
});
test("one complete bill creates valid history fields without claiming payment",()=>{
 const fields=emailBillFields(proposal);assert.equal(fields?.amount,"100.00");assert.equal(fields?.record_kind,"historical");
 assert.ok(!("payment_status" in fields!));
 for(const p of [{...proposal,currency:null},{...proposal,period_charges:null},{...proposal,account:null},{...proposal,period_end:null}])assert.equal(emailBillFields(p),null);
});
test("bill-ready notification without household facts is ignored",()=>{
 const message="Your bill is ready. Sign in to the provider portal to view it.";
 const p={...proposal,period_charges:null,period_start:null,period_end:null,due_date:null,summary:"A statement is available in the provider portal.",evidence:["Your bill is ready."]};
 assert.equal(emailBillFields(p),null);assert.equal(verifiedProposal(p,message),null);
});
test("warranty issue/purchase dates never become coverage start; invoice never establishes completed task",()=>{
 const warranty=emailRecordFields({...proposal,category:"warranty",expires_on:"2028-01-01"});
 assert.equal(warranty.issued_on,"");assert.equal(warranty.expires_on,"2028-01-01");
 const invoice=emailRecordFields({...proposal,category:"service_invoice"});
 assert.match(invoice.notes,/not independent confirmation/);assert.ok(!("completed_at" in invoice));
});
test("review schema requires confirmation and never updates existing documents",()=>{
 const input={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",expectedHomeId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",reviewed:true,destination:"record",record:emailRecordFields(proposal)};
 assert.equal(emailAcceptSchema.safeParse(input).success,true);
 assert.equal(emailAcceptSchema.safeParse({...input,reviewed:false}).success,false);
 assert.equal(emailAcceptSchema.safeParse({...input,record:{...input.record,id:input.id}}).success,false);
 assert.equal(emailAcceptSchema.safeParse({...input,destination:"bill"}).success,false);
});
test("worker persists bounded proposal, not raw email; reservation and generation errors fail safely",async()=>{
 for(const failure of ["none","reserve","extract","irrelevant"]){
  const calls:unknown[]=[];let extracts=0;
  const supabase={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{error:null};}} as unknown as SupabaseClient;
  await processEmailCapture(supabase,"id","lease",source,{
   reserve:async()=>({ok:failure!=="reserve"}),extract:async()=>{extracts++;if(failure==="extract")throw Error("private text");
    return failure==="irrelevant"?{...proposal,category:"unknown"}:proposal;},
  });
  assert.equal(calls.length,1);const call=calls[0] as {args:Record<string,unknown>};
  assert.equal(call.args.p_status,failure==="none"?"ready":failure==="irrelevant"?"ignored":"failed");
  assert.ok(!JSON.stringify(call).includes(source));
  assert.equal(extracts,failure==="reserve"?0:1);
 }
});
test("structured extraction bounds output size",()=>{
 assert.equal(emailProposalSchema.safeParse({...proposal,summary:"x".repeat(1601)}).success,false);
 assert.equal(emailProposalSchema.safeParse({...proposal,evidence:Array(6).fill("evidence")}).success,false);
});

test("extra model evidence is bounded without losing a valid finding or relaxing financial validation",()=>{
 const normalized=normalizeEmailProposal({...proposal,evidence:[...proposal.evidence,...Array(8).fill("additional quoted detail")]});
 assert.equal(normalized.evidence.length,5);
 assert.equal(verifiedProposal(normalized,source)?.evidence.length,1);
 assert.equal(normalized.period_charges,proposal.period_charges);
 assert.equal(normalized.currency,proposal.currency);
 assert.equal(normalizeEmailProposal({...proposal,evidence:["q".repeat(400)]}).evidence[0].length,240);
 assert.throws(()=>normalizeEmailProposal({...proposal,period_charges:100}));
 assert.throws(()=>normalizeEmailProposal({...proposal,evidence:[123]}));
 assert.equal(verifiedProposal(normalizeEmailProposal({...proposal,evidence:Array(8).fill("invented quote")}),source),null);
});


test("Enercare-style amount-due notice is useful without manufacturing statement history",()=>{
 const text="Enercare. Your bill is ready. Amount due $46.18. Bill due date 2026-10-20.";
 const p={...proposal,title:"Enercare billing notice",provider:"Enercare",service:null,account:null,
  amount_due:"46.18",period_charges:null,period_start:null,period_end:null,currency:null,issued_on:null,
  due_date:"2026-10-20",summary:"Enercare's email shows an amount due of $46.18.",evidence:["Amount due $46.18","Bill due date 2026-10-20"]};
 assert.ok(verifiedProposal(p,text));assert.equal(emailBillFields(p),null);
 assert.match(emailRecordFields(p).notes,/46.18 \(currency not stated\)/);
 assert.match(emailRecordFields(p).notes,/Not current-period charges/);
 assert.match(emailRecordFields(p).notes,/2026-10-20/);
 assert.equal(emailBillFields({...p,currency:"CAD"}),null);
 assert.ok(verifiedProposal({...p,due_date:null},text));
 assert.equal(emailProposalSchema.safeParse({...p,amount_due:"46.18 USD invented"}).success,false);
 assert.equal(emailProposalSchema.safeParse(proposal).success,true,"old saved proposals remain compatible");
});


test("formatted amount due cannot stop import or infer currency",()=>{
 for(const [input,expected] of [["$46.18","46.18"],["CAD 1,234.56","1234.56"],[" 46.18 ","46.18"],["-12.50","-12.50"]]){
  const result=normalizeEmailProposal({...proposal,amount_due:input,currency:null});
  assert.equal(result.amount_due,expected);assert.equal(result.currency,null);
  assert.equal(result.period_charges,proposal.period_charges);
 }
});
test("ambiguous amounts stay blank with an explicit review warning, never guessed or rounded",()=>{
 for(const input of ["1,234","46,18","1.234,56","46.185","46.18 USD invented","46.18 + 5","NaN","","10000000000.00"]){
  const result=normalizeEmailProposal({...proposal,amount_due:input});
  assert.equal(result.amount_due,null);assert.match(result.missing_detail!,/Check the original/);
  assert.equal(result.period_charges,proposal.period_charges);
 }
 assert.throws(()=>normalizeEmailProposal({...proposal,amount_due:46.18}));
 assert.throws(()=>normalizeEmailProposal({...proposal,amount_due:"x".repeat(121)}));
 assert.equal(emailProposalSchema.safeParse({...proposal,amount_due:"$46.18"}).success,false);
});
