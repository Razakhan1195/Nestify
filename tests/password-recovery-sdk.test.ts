import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { installPkceCrypto } from "../apps/mobile/src/auth/pkce-crypto";

test("native PKCE bridge uses secure randomness and SHA-256 without replacing existing crypto", async () => {
  const host = {} as { crypto: Crypto };
  installPkceCrypto(host, { random: values => webcrypto.getRandomValues(values), sha256: data => webcrypto.subtle.digest("SHA-256", data) });
  const values = new Uint32Array(56);
  assert.equal(host.crypto.getRandomValues(values), values);
  assert.ok(values.some(value => value !== 0));
  assert.equal(Buffer.from(await host.crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc"))).toString("hex"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  await assert.rejects(host.crypto.subtle.digest("SHA-1", new Uint8Array()), /Unsupported/);
  const existing = { crypto: webcrypto as unknown as Crypto };
  installPkceCrypto(existing, { random: () => { throw new Error("must keep native implementation"); }, sha256: () => { throw new Error("must keep native implementation"); } });
  assert.equal(existing.crypto, webcrypto);
});

test("installed Supabase SDK sends S256, persists a recovery verifier and exchanges it exactly once", async () => {
  const native = {} as { crypto: Crypto };
  installPkceCrypto(native, { random: values => webcrypto.getRandomValues(values), sha256: data => webcrypto.subtle.digest("SHA-256", data) });
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: native.crypto, configurable: true });
  try {
    const storage = new Map<string, string>([["normal-sign-in", "unmodified"]]);
    let challenge = "", exchanges = 0;
    const events: string[] = [];
    const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", email: "test@example.invalid", created_at: "2026-09-24T00:00:00Z", app_metadata: {}, user_metadata: {} };
    const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), Buffer.from("synthetic-signature").toString("base64url")].join(".");
    const client = createClient("https://auth-fixture.invalid", "synthetic-anon-key", {
      auth: { flowType: "pkce", storageKey: "recovery-test", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
        storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); }, removeItem: key => { storage.delete(key); } } },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input));
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (url.pathname === "/auth/v1/recover") {
          assert.equal(url.searchParams.get("redirect_to"), "rezlee://reset-password");
          assert.equal(body.code_challenge_method, "s256");
          challenge = body.code_challenge;
          return Response.json({});
        }
        if (url.pathname === "/auth/v1/token") {
          exchanges++;
          assert.equal(url.searchParams.get("grant_type"), "pkce");
          assert.equal(body.auth_code, "synthetic-recovery-code");
          assert.equal(createHash("sha256").update(body.code_verifier).digest("base64url"), challenge);
          return Response.json({ access_token: token, refresh_token: "synthetic-refresh", expires_in: 3600, token_type: "bearer", user });
        }
        throw new Error("Unexpected auth fixture request");
      } },
    });
    const subscription = client.auth.onAuthStateChange(event => { events.push(event); });
    assert.equal((await client.auth.resetPasswordForEmail(user.email, { redirectTo: "rezlee://reset-password" })).error, null);
    assert.ok(storage.has("recovery-test-code-verifier"));
    const exchange = await client.auth.exchangeCodeForSession("synthetic-recovery-code");
    assert.equal(exchange.error, null); assert.equal(exchange.data.user?.id, user.id);
    assert.equal(exchanges, 1); assert.ok(events.includes("PASSWORD_RECOVERY"));
    assert.equal(storage.has("recovery-test-code-verifier"), false);
    assert.ok(storage.has("recovery-test")); assert.equal(storage.get("normal-sign-in"), "unmodified");
    subscription.data.subscription.unsubscribe();
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});

test("installed SDK verifies an email recovery code into isolated storage", async () => {
  const storage = new Map<string,string>([["normal-sign-in","unchanged"]]);
  const events:string[] = [];
  const user = {id:"00000000-0000-4000-8000-000000000002",email:"test@example.invalid",aud:"authenticated",created_at:"2026-10-12T00:00:00Z",app_metadata:{},user_metadata:{}};
  const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),Buffer.from("synthetic").toString("base64url")].join(".");
  let calls=0;
  const client=createClient("https://auth-fixture.invalid","synthetic-anon-key",{
    auth:{flowType:"pkce",storageKey:"recovery-code",persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,
      storage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{storage.set(key,value)},removeItem:key=>{storage.delete(key)}}},
    global:{fetch:async(input,init)=>{
      calls++;assert.equal(new URL(String(input)).pathname,"/auth/v1/verify");
      const body=JSON.parse(String(init?.body));assert.equal(body.type,"recovery");assert.equal(body.email,user.email);assert.equal(body.token,"12345678");
      return Response.json({access_token:token,refresh_token:"synthetic-refresh",expires_in:3600,token_type:"bearer",user});
    }}
  });
  const subscription=client.auth.onAuthStateChange(event=>{events.push(event)});
  const result=await client.auth.verifyOtp({email:user.email,token:"12345678",type:"recovery"});
  assert.equal(result.error,null);assert.equal(result.data.user?.id,user.id);
  assert.equal(calls,1);assert.ok(events.includes("PASSWORD_RECOVERY"));
  assert.ok(storage.has("recovery-code"));assert.equal(storage.get("normal-sign-in"),"unchanged");
  subscription.data.subscription.unsubscribe();
});
