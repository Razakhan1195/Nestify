import test from "node:test";
import assert from "node:assert/strict";
import { inventoryInput } from "../src/lib/product/inventory-input";
test("inventory rejects blank names, malformed ids and oversized identity fields", () => {
  assert.equal(inventoryInput.safeParse({ name: " " }).success, false);
  assert.equal(inventoryInput.safeParse({ name: "Washer", id: "other" }).success, false);
  assert.equal(inventoryInput.safeParse({ name: "Washer", brand: "a".repeat(201) }).success, false);
});
test("inventory strips ownership input and permits incomplete manual records", () => {
  const parsed = inventoryInput.parse({ name: " Washer ", user_id: "other", home_id: "other" });
  assert.equal(parsed.name, "Washer");
  assert.equal(parsed.brand, "");
  assert.equal("user_id" in parsed, false);
  assert.equal("home_id" in parsed, false);
});
