import test from "node:test";
import assert from "node:assert/strict";
import { vaultRecordInput } from "../src/lib/product/vault-input";
const valid={title:"Dishwasher warranty",category:"Warranty",issued_on:"2026-02-01",expires_on:"2028-02-01",notes:""};
test("warranty records validate calendar dates and coverage order",()=>{
 assert.equal(vaultRecordInput.safeParse(valid).success,true);
 assert.equal(vaultRecordInput.safeParse({...valid,issued_on:"2026-02-30"}).success,false);
 assert.equal(vaultRecordInput.safeParse({...valid,expires_on:"2025-02-01"}).success,false);
});
test("record metadata allows missing files and optional dates but rejects empty titles and ownership injection",()=>{
 const record=vaultRecordInput.parse({...valid,issued_on:"",expires_on:"",user_id:"other",storage_path:"other/file"});
 assert.equal("user_id" in record,false);assert.equal("storage_path" in record,false);
 assert.equal(vaultRecordInput.safeParse({...valid,title:" "}).success,false);
});
