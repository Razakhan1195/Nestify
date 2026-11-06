import test from "node:test";
import assert from "node:assert/strict";
import { EZGB_RETURN_COOKIE, readEzgbBrowserReturn, saveEzgbBrowserMarker } from "../src/lib/ezgb/browser-storage";
import { EZGB_BROWSER_STORAGE, EZGB_BROWSER_TTL, ezgbBrowserMarker, ezgbBrowserCallback } from "../apps/mobile/src/lib/ezgb-browser-contract";
import { ezgbPublicBaseUrl } from "../src/lib/ezgb/guest";

const id = "11111111-1111-4111-8111-111111111111";
function session(blocked = false): Storage {
  const data = new Map<string,string>();
  return {
    get length() { return data.size; }, clear() { data.clear(); },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { if(blocked) throw Error("blocked"); return data.get(k) ?? null; },
    setItem(k,v) { if(blocked) throw Error("blocked"); data.set(k,v); },
    removeItem(k) { if(blocked) throw Error("blocked"); data.delete(k); },
  };
}
function jar(blocked = false) {
  let value = "", last = "";
  return { get last() { return last; }, get cookie() { return value; }, set cookie(v:string) {
    last = v; if (!blocked) value = v.includes("Max-Age=0") ? "" : v.split(";")[0];
  }};
}
test("return survives a fresh tab or blocked session storage, without sharing cookies across origins",()=>{
  for(const blocked of [false,true]) {
    const storage=session(blocked), document=jar(), marker=ezgbBrowserMarker("#rezleeAttempt="+id)!;
    assert.equal(saveEzgbBrowserMarker(marker,storage,document),true);
    assert.match(document.last,/Path=\/; Secure; SameSite=Lax; Max-Age=1200/);
    assert.doesNotMatch(document.last,/Domain=|userId|connectionIntent/);
    const callback=readEzgbBrowserReturn(session(),document,"success")!;
    assert.ok(callback);
    assert.equal(ezgbBrowserCallback(callback,{id,userId:"owner",userIdentifier:"rz_"+"a".repeat(32),createdAt:Date.now()},"owner"),"success");
    assert.throws(()=>ezgbBrowserCallback(callback,{id,userId:"owner",userIdentifier:"rz_"+"a".repeat(32),createdAt:Date.now()},"someone-else"));
    assert.equal(readEzgbBrowserReturn(session(),jar(),"success"),null);
  }
});
test("blocked cookies use session storage; blocking both produces an actionable warning",()=>{
  const marker=ezgbBrowserMarker("#rezleeAttempt="+id)!;
  const storage=session(),document=jar(true);
  assert.equal(saveEzgbBrowserMarker(marker,storage,document),true);
  assert.match(readEzgbBrowserReturn(storage,document,"error")!,/outcome=error/);
  assert.equal(saveEzgbBrowserMarker(marker,session(true),jar(true)),false);
});
test("fresh start without a marker clears previous browser state",()=>{
  const storage=session(),document=jar();
  saveEzgbBrowserMarker(ezgbBrowserMarker("#rezleeAttempt="+id),storage,document);
  saveEzgbBrowserMarker(null,storage,document);
  assert.equal(storage.getItem(EZGB_BROWSER_STORAGE),null);
  assert.equal(readEzgbBrowserReturn(storage,document,"success"),null);
});
test("malformed, duplicate and expired cookie markers do not reopen the app",()=>{
  for(const raw of ["bad",encodeURIComponent(JSON.stringify({id,createdAt:Date.now()-EZGB_BROWSER_TTL-1000}))]) {
    assert.equal(readEzgbBrowserReturn(session(),{cookie:EZGB_RETURN_COOKIE+"="+raw},"success"),null);
  }
  assert.equal(readEzgbBrowserReturn(session(),{cookie:EZGB_RETURN_COOKIE+"=a; "+EZGB_RETURN_COOKIE+"=b"},"success"),null);
});
test("production API origin cannot silently replace the vendor-registered callback origin",()=>{
  const before=process.env.EZGB_PUBLIC_APP_URL, mode=process.env.NODE_ENV;
  try {
    Object.assign(process.env,{NODE_ENV:"production",EZGB_PUBLIC_APP_URL:"https://ezgb-test.rezlee.com/"});
    for(const api of ["https://rezlee.com/api/mobile/v1/ezgb/authorization","https://staging.rezlee.com/api/mobile/v1/ezgb/authorization"]) {
      assert.equal(ezgbPublicBaseUrl(api),"https://ezgb-test.rezlee.com");
    }
    delete process.env.EZGB_PUBLIC_APP_URL;
    assert.throws(()=>ezgbPublicBaseUrl("https://rezlee.com/api/mobile/v1/ezgb/authorization"));
    for(const bad of ["http://example.com","https://user:password@example.com","https://example.com/path","https://example.com?redirect=bad","https://example.com#fragment","[SENSITIVE]"]) {
      process.env.EZGB_PUBLIC_APP_URL=bad; assert.throws(()=>ezgbPublicBaseUrl("https://rezlee.com"));
    }
  } finally {
    if(before===undefined) delete process.env.EZGB_PUBLIC_APP_URL; else process.env.EZGB_PUBLIC_APP_URL=before;
    if(mode===undefined) Reflect.deleteProperty(process.env,"NODE_ENV"); else Object.assign(process.env,{NODE_ENV:mode});
  }
});
