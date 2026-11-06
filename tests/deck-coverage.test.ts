import test from "node:test";
import assert from "node:assert/strict";
import { providerCoversProvince } from "../src/lib/deck/coverage";
test("Ontario catalogue excludes other provinces and unknown coverage", () => {
  for (const region of ["Ontario", "ON", "Alberta / Ontario", "Ontario / Quebec", "Canada"]) assert.equal(providerCoversProvince(region, "ON"), true, region);
  for (const region of ["Alberta", "British Columbia", "Western Canada", "", null, "Ontario coming soon"]) assert.equal(providerCoversProvince(region, "Ontario"), false, String(region));
});
test("coverage normalization and incomplete household profiles", () => {
  assert.equal(providerCoversProvince("Québec", "QC"), true);
  assert.equal(providerCoversProvince("Canada", null), true);
  assert.equal(providerCoversProvince("Ontario", null), false);
  assert.equal(providerCoversProvince("Ontario", "Toronto"), false);
});
