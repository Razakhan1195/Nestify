import test from "node:test";
import assert from "node:assert/strict";
import { createEzgbClient, EzgbConfigurationError } from "../src/lib/ezgb/client";
test("missing credentials fail before any EZGB request", async()=>{
 const id=process.env.EZGB_CLIENT_ID,secret=process.env.EZGB_CLIENT_SECRET,fetcher=globalThis.fetch;let calls=0;
 try {delete process.env.EZGB_CLIENT_ID;delete process.env.EZGB_CLIENT_SECRET;
 globalThis.fetch=async()=>{calls++;throw Error("Unexpected network request");};
 await assert.rejects(createEzgbClient().getUserAccounts("synthetic-config-test"),EzgbConfigurationError);assert.equal(calls,0);
 }finally{globalThis.fetch=fetcher;if(id===undefined)delete process.env.EZGB_CLIENT_ID;else process.env.EZGB_CLIENT_ID=id;if(secret===undefined)delete process.env.EZGB_CLIENT_SECRET;else process.env.EZGB_CLIENT_SECRET=secret;}
});
