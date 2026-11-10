/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs"), ts = require("typescript"), vm = require("node:vm"), path = require("node:path");
const filename = path.join(__dirname, "../src/lib/store-purchase-error.ts");
const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} }; vm.runInNewContext(js, context, { filename });
const explain = context.exports.storePurchaseFailure;
for (const code of [7, "7", 13, "13"]) {
 const failure = explain({ code });
 assert.equal(failure.kind, "account");
 assert.match(failure.message, /another Rezlee account/);
 assert.match(failure.message, /Don’t buy again/);
}
for (const error of [null, undefined, new Error("private vendor payload"), {code:"10",message:"private vendor payload"}]) {
 const failure = explain(error); assert.equal(failure.kind,"restore"); assert.ok(!failure.message.includes("private vendor payload"));
}
console.log("PASS: receipt ownership and safe fallback errors");
