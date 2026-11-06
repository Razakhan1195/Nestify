import test from "node:test";
import assert from "node:assert/strict";
import { matchReason, normalizeRecalls, recallKey, type Recall } from "../src/lib/recalls/matching";
const recall: Recall = { id: "123", title: "Acme washing machines recalled", product: "Acme washer AB-1234", issue: "Fire", action: "Stop use", url: "https://recalls-rappels.canada.ca/en/alert-recall/test", updated: "2026-09-21" };
test("recall model matching requires brand and full model boundaries", () => {
  assert.ok(matchReason({ id: "i", name: "Laundry", brand: "Acme", model_number: "AB-1234" }, recall));
  assert.equal(matchReason({ id: "i", name: "Laundry", brand: "Acme", model_number: "AB-123" }, recall), null);
  assert.equal(matchReason({ id: "i", name: "Laundry", brand: "Other", model_number: "AB-1234" }, recall), null);
  assert.equal(matchReason({ id: "i", name: "Acme", brand: "Acme", model_number: null }, recall), null);
});
test("description matches remain candidates and missing brands cannot match", () => {
  assert.ok(matchReason({ id: "i", name: "Washer", brand: "Acme", model_number: null }, recall));
  assert.equal(matchReason({ id: "i", name: "Washer", brand: null, model_number: "AB-1234" }, recall), null);
});
test("notice updates and different household items have distinct review identities", () => {
  assert.notEqual(recallKey("i", recall), recallKey("j", recall));
  assert.notEqual(recallKey("i", recall), recallKey("i", { ...recall, updated: "2026-09-22" }));
});
test("feed normalization only accepts official https consumer notices and retains older recalls", () => {
  const row = { NID: "123", Title: "Recall", Product: "Acme", Organization: "Consumer product safety", URL: recall.url, "Last updated": recall.updated, Archived: "1" };
  assert.equal(normalizeRecalls([row]).length, 1);
  assert.equal(normalizeRecalls([{ ...row, URL: "https://recalls-rappels.canada.ca.evil.test/x" }]).length, 0);
  assert.equal(normalizeRecalls([{ ...row, Organization: "Medical devices" }]).length, 0);
  assert.throws(() => normalizeRecalls({}));
});
