import test from "node:test";
import assert from "node:assert/strict";
import { eligibleStorePlan } from "../apps/mobile/src/lib/store-product-policy";
const month = { packageType: "MONTHLY", product: { identifier: "rezlee.month", currencyCode: "CAD", price: 7.99, subscriptionPeriod: "P1M" } };
test("approved recurring products remain available with localized and TestFlight prices", () => {
 for (const patch of [{}, { currencyCode: "USD", price: 5.99 }, {currencyCode:"GBP",price:4.99}])
  assert.equal(eligibleStorePlan({...month,product:{...month.product,...patch}},["rezlee.month"]),true);
 assert.equal(eligibleStorePlan({packageType:"ANNUAL",product:{identifier:"rezlee.year",currencyCode:"CAD",price:80,subscriptionPeriod:"P1Y"}},["rezlee.year"]),true);
 assert.equal(eligibleStorePlan({packageType:"ANNUAL",product:{identifier:"rezlee.year",currencyCode:"USD",price:59.99,subscriptionPeriod:"P1Y"}},["rezlee.year"]),true);
});
test("unapproved products, invalid prices and wrong billing periods never reach checkout",()=>{
 assert.equal(eligibleStorePlan(month,[]),false);
 for(const patch of [{identifier:"unapproved"},{subscriptionPeriod:"P1W"},{subscriptionPeriod:null},{price:NaN},{price:Infinity},{price:0},{price:-1},{currencyCode:""},{currencyCode:"usd"}])
  assert.equal(eligibleStorePlan({...month,product:{...month.product,...patch}},["rezlee.month"]),false);
 assert.equal(eligibleStorePlan({...month,packageType:"ANNUAL"},["rezlee.month"]),false);
});
