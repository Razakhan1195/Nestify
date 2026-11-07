import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function fixture() {
 let epoch = 1;
 const reads: { user: string; resolve: (value: unknown) => void }[] = [];
 const source = ts.transpileModule(fs.readFileSync("apps/mobile/src/lib/membership.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
 const exports: { loadMembership?: (id: string, force?: boolean) => Promise<unknown>; getMembershipSnapshot?: (id: string) => unknown } = {};
 vm.runInNewContext(source, { exports, require: (name: string) => {
  if(name === "./screen-state") return {screenEpoch: () => epoch};
  if(name === "./api") return {apiPost: (_: string, __: unknown, options: { expectedUserId: string }) => new Promise(resolve => reads.push({user:options.expectedUserId,resolve}))};
  throw Error("Unexpected import "+name);
 }, Date, Map, Set, Promise });
 return {load:exports.loadMembership!, snapshot:exports.getMembershipSnapshot!, reads, switchAccount:()=>epoch++};
}
test("gift refresh starts after an older membership read and cannot be overwritten by its stale result", async () => {
 const h=fixture(), free={membership:{plan:"free"}}, pro={membership:{plan:"pro",lifetime:false}};
 const before=h.load("customer"), refresh=h.load("customer",true);
 assert.equal(h.reads.length,2); assert.deepEqual(h.reads.map(r=>r.user),["customer","customer"]);
 h.reads[1].resolve(pro); assert.equal(await refresh,pro);
 h.reads[0].resolve(free); assert.equal(await before,pro); assert.equal(h.snapshot("customer"),pro);
});
test("ordinary membership reads still coalesce and reuse a fresh result", async () => {
 const h=fixture(), value={membership:{plan:"pro",lifetime:true}};
 const first=h.load("customer"), second=h.load("customer");assert.equal(h.reads.length,1);
 h.reads[0].resolve(value);await first;await second;assert.equal(await h.load("customer"),value);assert.equal(h.reads.length,1);
});
test("a late gift refresh cannot publish after the account changes", async () => {
 const h=fixture(), old=h.load("first",true);h.switchAccount();
 const current=h.load("second");h.reads[1].resolve({membership:{plan:"free"}});await current;
 h.reads[0].resolve({membership:{plan:"pro"}});await old;
 assert.equal(h.snapshot("first"),null);assert.deepEqual(h.snapshot("second"),{membership:{plan:"free"}});
});
