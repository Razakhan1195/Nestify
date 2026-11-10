/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const path = require("node:path");
const filename = path.join(__dirname, "../src/lib/format-currency.ts");
const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const context = { exports: {}, Intl };
vm.runInNewContext(js, context, { filename });
const money = context.exports.formatCurrency;
assert.equal(money(271.08), "$271.08", "Statement cents must survive display");
assert.equal(money(0.08), "$0.08", "Small remaining balances must not appear paid");
assert.equal(money(-12.34), "-$12.34", "Credit amounts retain sign and cents");
assert.equal(money(0), "$0.00");
assert.equal(money(12.34, "USD"), "US$12.34", "A USD bill must not be labelled CAD");
assert.equal(money(271, "JPY"), "JP¥271", "Currency minor units follow Intl rules");
console.log("PASS: six financial display cases");
