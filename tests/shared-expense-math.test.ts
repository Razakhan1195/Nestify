import test from "node:test";
import assert from "node:assert/strict";
import {parseCadCents,equalExpenseShares,sumShares} from "../apps/mobile/src/lib/shared-expense-math";
test("CAD input rejects ambiguous, fractional-cent and unsupported amounts",()=>{
 for(const [text,cents] of [["0.01",1],["123.4",12340],["1000000",100000000],[" 50.00 ",5000]] as const)assert.equal(parseCadCents(text),cents);
 for(const text of ["","0","-1","1.001","1,200","1e3","$2","01","NaN","Infinity","1000000.01"])assert.equal(parseCadCents(text),null,text);
});
test("equal shares preserve cents and have deterministic remainder regardless of selection order",()=>{
 assert.deepEqual(equalExpenseShares(100,["c","a","b"]),[{personId:"a",cents:34},{personId:"b",cents:33},{personId:"c",cents:33}]);
 for(let n=1;n<=40;n++)for(const amount of [1,10,100,100001,100000000]){
  const ids=Array.from({length:n},(_,i)=>String(i));const shares=equalExpenseShares(amount,ids);
  assert.equal(sumShares(shares),amount);assert.deepEqual(shares,equalExpenseShares(amount,[...ids].reverse()));
 }
 assert.throws(()=>equalExpenseShares(100,["a","a"]));assert.throws(()=>equalExpenseShares(100,[]));
});
