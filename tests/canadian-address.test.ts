import test from "node:test";
import assert from "node:assert/strict";
import { provinces, validPostalCode, formatPostalCode, normalizeCanadianAddress } from "../apps/mobile/src/lib/canadian-address";
import { googleAddressLookup } from "../src/lib/onboarding/google-places";
test("Canadian form supports all provinces/territories and normalizes postal codes", () => {
  assert.equal(provinces.length, 13);
  assert.equal(new Set(provinces.map(p => p[0])).size, 13);
  assert.equal(formatPostalCode(" k1a0b1 "), "K1A 0B1");
  for (const code of ["K1A 0B1", "X0A0H0", "h2x 1y4"]) assert.equal(validPostalCode(code), true);
  for (const code of ["D1A 0A1", "12345", "K1A", "K1A 0D1"]) assert.equal(validPostalCode(code), false);
});
test("address parsing handles Quebec, units and missing data without inventing city/postal", () => {
  const c = (type: string, longText: string, shortText = longText) => ({ types: [type], longText, shortText });
  assert.deepEqual(normalizeCanadianAddress([
    c("country", "Canada", "CA"), c("administrative_area_level_1", "Québec", "QC"),
    c("street_number", "12"), c("route", "Rue Example"), c("subpremise", "4"),
  ]), { street_address: "4–12 Rue Example", city: "", province: "Quebec", postal_code: "" });
  assert.equal(normalizeCanadianAddress([c("country", "United States", "US")]), null);
  assert.equal(normalizeCanadianAddress([]), null);
});
test("autocomplete restricts Canada, uses session token and minimal fields, does not cache", async () => {
  let count = 0;
  const fake: typeof fetch = async (url, init) => {
    count++;
    assert.equal(url, "https://places.googleapis.com/v1/places:autocomplete");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.includedRegionCodes, ["ca"]);
    assert.equal(body.sessionToken, "session");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.method, "POST");
    assert.ok(init?.signal);
    return Response.json({ suggestions: [{ placePrediction: { placeId: "id", text: { text: "12 Example, Canada" } } }, { queryPrediction: {} }] });
  };
  assert.deepEqual(await googleAddressLookup({ input: "12 Example", sessionToken: "session" }, "test-key", fake), { suggestions: [{ id: "id", label: "12 Example, Canada" }] });
  assert.equal(count, 1);
});
test("details uses same session and returns only normalized Canadian form fields", async () => {
  const fake: typeof fetch = async (url, init) => {
    assert.ok(String(url).includes("/places/id?sessionToken=session"));
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string,string>)["X-Goog-FieldMask"], "addressComponents");
    return Response.json({ addressComponents: [{ types: ["country"], shortText: "CA" }, { types: ["locality"], longText: "Toronto" }] });
  };
  assert.deepEqual(await googleAddressLookup({ placeId: "id", sessionToken: "session" }, "key", fake), { address: { street_address: "", city: "Toronto", province: "", postal_code: "" } });
});
test("Google failures are bounded with no automatic paid retry or provider output leakage", async () => {
  let calls = 0;
  const fake: typeof fetch = async () => { calls++; return new Response("sensitive upstream output", { status: 429 }); };
  await assert.rejects(googleAddressLookup({ input: "abc", sessionToken: "s" }, "key", fake), /^Error: Address search unavailable$/);
  assert.equal(calls, 1);
  await assert.rejects(googleAddressLookup({ placeId: "id", sessionToken: "s" }, "key", async () => Response.json({ addressComponents: [] })), /Choose a Canadian address/);
});
