import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { isPixelPage, loadTikTokPixel, saveMarketingConsent, trackWaitlistRegistration, TIKTOK_PIXEL_ID } from "../src/lib/tiktok-pixel";

test("pixel is limited to the production homepage and campaign URLs", () => {
  for (const url of ["https://rezlee.com/", "https://www.rezlee.com/?ttclid=campaign&utm_source=tiktok#waitlist"])
    assert.equal(isPixelPage(new URL(url)), true);
  for (const url of ["https://staging.rezlee.com/", "http://localhost:3000/", "https://rezlee.com/admin", "https://rezlee.com/app/bills", "https://rezlee.com/waitlist/confirm?token=secret", "https://rezlee.com/?email=private@example.com"])
    assert.equal(isPixelPage(new URL(url)), false);
});

test("no SDK before consent; one page event; one successful signup per session; withdrawal and SDK failures are safe", () => {
  const originals = new Map(["window", "document", "localStorage", "sessionStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const store = new Map<string, string>(), session = new Map<string, string>();
  const storage = (map: Map<string, string>) => ({ getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => map.set(key, value) });
  type Script = { id?: string; textContent?: string; src?: string };
  const scripts: Script[] = [], requests: string[] = [];
  let reloads = 0;
  const win = { location: { href: "https://rezlee.com/?ttclid=example", reload: () => reloads++ } } as unknown as Window;
  const doc = {
    cookie: "",
    getElementById: (id: string) => scripts.find(s => s.id === id),
    createElement: () => ({} as Script),
    getElementsByTagName: () => [{ parentNode: { insertBefore: (s: Script) => requests.push(s.src ?? "") } }],
    head: { appendChild: (s: Script) => { scripts.push(s); vm.runInNewContext(s.textContent ?? "", { window: win, document: doc }); } },
  };
  for (const [key, value] of Object.entries({ window: win, document: doc, localStorage: storage(store), sessionStorage: storage(session) }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  try {
    loadTikTokPixel();
    trackWaitlistRegistration();
    assert.equal(requests.length, 0);
    saveMarketingConsent("declined");
    loadTikTokPixel();
    assert.equal(requests.length, 0);
    saveMarketingConsent("accepted");
    loadTikTokPixel();
    assert.equal(requests.length, 1);
    assert(requests[0].includes("sdkid=" + TIKTOK_PIXEL_ID));
    const queue = win.ttq as unknown as unknown[][];
    assert.equal(queue.filter(entry => entry[0] === "page").length, 1);
    const originalTrack = win.ttq!.track;
    win.ttq!.track = () => { throw Error("blocked"); };
    assert.doesNotThrow(trackWaitlistRegistration);
    win.ttq!.track = originalTrack;
    trackWaitlistRegistration();
    trackWaitlistRegistration();
    assert.deepEqual(Array.from(queue.filter(entry => entry[0] === "track"), entry => Array.from(entry)), [["track", "CompleteRegistration"]]);
    saveMarketingConsent("declined");
    assert.equal(reloads, 1);
    assert(queue.some(entry => entry[0] === "revokeConsent"));
    assert(queue.some(entry => entry[0] === "disableCookie"));
    trackWaitlistRegistration();
    assert.equal(queue.filter(entry => entry[0] === "track").length, 1);
  } finally {
    for (const [key, descriptor] of originals)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  }
});
