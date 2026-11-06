import assert from "node:assert/strict";
import test from "node:test";
import { documentCategory } from "../src/lib/product/vault-category";
test("explicit categories survive generic legacy storage types and misleading titles", () => {
  assert.equal(documentCategory({ category: "Other", document_type: "Manual", title: "Home service invoice", file_name: "invoice.pdf" }), "Other");
  assert.equal(documentCategory({ category: "Manual", document_type: "Other", title: "Warranty troubleshooting", file_name: null }), "Manual");
  assert.equal(documentCategory({ category: "Receipt", document_type: "Manual", title: "Purchase", file_name: null }), "Receipt");
});
test("legacy records without a saved category retain their supported fallback", () => {
  assert.equal(documentCategory({ document_type: "Warranty", title: "Coverage", file_name: null }), "Warranty");
  assert.equal(documentCategory({ category: null, document_type: null, title: "Home receipt", file_name: null }), "Receipt");
  assert.equal(documentCategory({ document_type: null, title: "Home record", file_name: null }), "Other");
});
