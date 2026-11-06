import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBarcode,productSuggestions } from "../src/lib/product/barcode";
test("validates checksums and normalizes iOS leading-zero UPC scans",()=>{
 assert.equal(normalizeBarcode("036000291452"),"036000291452");
 assert.equal(normalizeBarcode("0036000291452"),"036000291452");
 assert.equal(normalizeBarcode("4002293401102"),"4002293401102");
 assert.equal(normalizeBarcode("036000291453"),null);
 assert.equal(normalizeBarcode("https://example.com"),null);
 assert.equal(normalizeBarcode("AB12345"),null);
});
test("lookup suggestions require the requested barcode and never substitute UPC for model",()=>{
 const code="036000291452";
 const items=[{upc:code,title:"Product",brand:"Brand",model:code},{upc:"4002293401102",title:"Wrong product"},{ean:"0036000291452",title:"Product",brand:"Brand",model:code}];
 const rows=productSuggestions({items},code);
 assert.equal(rows.length,1);assert.equal(rows[0].model_number,"");assert.equal(rows[0].product_barcode,code);
 assert.deepEqual(productSuggestions({items:[{title:"No identity"}]},code),[]);
});


test("shared barcode quota slots cannot be double-booked or exceed the pilot limit", async () => {
 const { PGlite } = await import("@electric-sql/pglite");
 const { readFile } = await import("node:fs/promises");
 const db = new PGlite();
 try {
  await db.exec("create schema auth; create table auth.users(id uuid primary key); create table inventory_items(id uuid primary key);");
  await db.exec(await readFile("supabase/migrations/202609230003_product_lookup.sql", "utf8"));
  const user = "11111111-1111-4111-8111-111111111111";
  await db.exec(`insert into auth.users values ('${user}')`);
  const sql = `insert into product_lookup_requests(day,slot,user_id) values ('2026-09-23',0,'${user}')`;
  await db.exec(sql);
  await assert.rejects(db.exec(sql));
  await assert.rejects(db.exec(`insert into product_lookup_requests(day,slot,user_id) values ('2026-09-23',80,'${user}')`));
  assert.equal((await db.query("select * from product_lookup_requests")).rows.length, 1);
 } finally { await db.close(); }
});
