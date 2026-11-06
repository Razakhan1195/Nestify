import test from "node:test";
import assert from "node:assert/strict";
import {eraseStoreCustomer} from "../src/lib/account/store-deletion";
import {parseStoreEntitlement} from "../src/lib/membership/policy";
const user="00000000-0000-4000-8000-000000000001";
test("Billing privacy erasure accepts only documented completion responses and is retry safe",async()=>{
 for(const status of [200,404]){let method="";assert.equal(await eraseStoreCustomer(user,"fixture",async(url,init)=>{assert.equal(url,`https://api.revenuecat.com/v1/subscribers/${user}`);method=String(init?.method);return new Response(null,{status});}),true);assert.equal(method,"DELETE");}
 for(const status of [202,204,401,429,500])await assert.rejects(eraseStoreCustomer(user,"fixture",async()=>new Response(null,{status})));
 await assert.rejects(eraseStoreCustomer(user,"fixture",async()=>{throw Error("private upstream detail")} ),e=>e instanceof Error&&!e.message.includes("private"));
});
test("A store subscription belonging to another Rezlee account cannot unlock Pro",()=>{
 const body={subscriber:{original_app_user_id:"00000000-0000-4000-8000-000000000002",entitlements:{rezlee_pro:{product_identifier:"monthly",expires_date:"2099-01-01T00:00:00Z"}},subscriptions:{monthly:{store:"app_store",is_sandbox:false}}}};
 assert.throws(()=>parseStoreEntitlement(body,new Set(["monthly"]),false,Date.now(),user),/different Rezlee account/);
});
