import test from "node:test";
import assert from "node:assert/strict";
import {homeBillAccounts} from "../apps/mobile/src/lib/home-bill-accounts";
import {exampleStatements} from "../apps/mobile/src/lib/home-start";
const today="2026-07-01";
const account=(provider:string,nickname:string,count:number)=>exampleStatements.slice(0,count).map((b,i)=>({...b,id:provider+nickname+i,providerName:provider,accountNumber:nickname}));
test("three providers with one bill each stay three single-statement journeys",()=>{
 const rows=homeBillAccounts([...account("Rogers","Internet",1),...account("Enbridge","Gas",1),...account("Elexicon","Electricity",1)],true,today);
 assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.count),[1,1,1]);
 assert.ok(rows.every(r=>!r.ready&&r.destination==="review"&&r.action==="Understand this bill"));
 assert.deepEqual(rows.map(r=>r.provider),["Elexicon","Enbridge","Rogers"]);
});
test("different amounts of history get independent useful actions",()=>{
 const rows=homeBillAccounts([...account("Elexicon","Home",3),...account("Enbridge","Home",1),...account("Rogers","Home",2)],true,today);
 assert.equal(rows[0].ready,true);assert.match(rows[0].finding,/20% higher/);
 assert.equal(rows[1].action,"Understand this bill");
 assert.equal(rows[2].action,"Review what changed");
});
test("same provider with different accounts is never pooled and order survives newer uploads",()=>{
 const initial=[...account("Elexicon","Rental",1),...account("Elexicon","Home",1)];
 const rows=homeBillAccounts(initial,true,today);
 assert.deepEqual(rows.map(r=>r.nickname),["Home","Rental"]);
 const more=homeBillAccounts([...initial,...account("Elexicon","Rental",3).slice(1)],true,today);
 assert.deepEqual(more.map(r=>r.nickname),["Home","Rental"]);assert.equal(more[0].ready,false);assert.equal(more[1].ready,true);
});
test("connected rows do not count toward uploaded history and do not suppress it",()=>{
 const manual=account("Elexicon","Home",1);
 const connected=account("Elexicon","Home",3).map(b=>({...b,id:"connected-"+b.id,source:"ezgb",providerId:"connected-provider"}));
 assert.equal(homeBillAccounts(connected,true,today).length,0);
 const mixed=homeBillAccounts([...manual,...connected],true,today);
 assert.equal(mixed.length,1);assert.equal(mixed[0].count,1);assert.equal(mixed[0].ready,false);
});
test("unsafe comparisons point to review, not fabricated trends",()=>{
 const rows=account("Elexicon","Home",3);
 for(const input of [rows.map((b,i)=>i===2?{...b,billingPeriodStart:"2026-05-15"}:b),rows.map(b=>({...b,accountNumber:null}))]){
  assert.ok(homeBillAccounts(input,true,today).every(a=>!a.ready&&a.destination==="history"));
 }
 assert.equal(homeBillAccounts(rows,false,today)[0].ready,false);
 assert.match(homeBillAccounts(rows,false,today)[0].finding,/could not be confirmed/);
 assert.equal(homeBillAccounts([],true,today).length,0);
});
test("unsupported currency single statement opens its bill rather than CAD-only review",()=>{
 const result=homeBillAccounts(account("Example","Home",1).map(b=>({...b,currency:"USD"})),true,today);
 assert.equal(result[0].destination,"bill");
});
