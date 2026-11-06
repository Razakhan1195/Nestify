import test from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppleGrantProblem, appleConfig, appleGrantHash, openAppleGrant, readBoundedJson, retainAppleGrant, sealAppleGrant, validateAppleGrant, verifiedAppleSubject, type AppleConfig } from "../src/lib/auth/apple-grants";
import { revokeAppleForDeletion, revokeAppleToken } from "../src/lib/account/apple-deletion";
import { DeletionProblem } from "../src/lib/account/deletion-policy";

const config: AppleConfig = { clientId: "com.example.app.web", clientSecret: "fixture-secret", encryptionKey: Buffer.alloc(32, 7) };
const privateToken = "fixture-private-refresh-token";
const keys = generateKeyPair("RS256");
async function identity(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = await keys;
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ sub: "apple-owner", iss: "https://appleid.apple.com", aud: config.clientId, iat: now, exp: now + 300, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(privateKey);
  return { token, key: createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "fixture", alg: "RS256" }] }) };
}
test("Apple identity binding checks the real JWT signature, audience, issuer, subject and expiry", async () => {
  const valid = await identity();
  assert.equal(await verifiedAppleSubject(valid.token, config.clientId, valid.key), "apple-owner");
  for (const overrides of [{ aud: "other-app" }, { iss: "https://attacker.invalid" }, { sub: "" }, { exp: 1 }, { iat: Math.floor(Date.now()/1000)+500 }]) {
    const bad = await identity(overrides);
    await assert.rejects(verifiedAppleSubject(bad.token, config.clientId, bad.key), AppleGrantProblem);
  }
  const foreign = await generateKeyPair("RS256");
  const foreignKey = createLocalJWKSet({ keys: [{ ...await exportJWK(foreign.publicKey), kid: "fixture", alg: "RS256" }] });
  await assert.rejects(verifiedAppleSubject(valid.token, config.clientId, foreignKey), AppleGrantProblem);
});
test("server configuration rejects expired or wrong-app secrets and invalid encryption keys", () => {
  const now = Date.now(), sec = Math.floor(now/1000);
  const env = (claims: object, key = config.encryptionKey.toString("base64")) => ({
    REZLEE_APPLE_CLIENT_ID: config.clientId, REZLEE_APPLE_TEAM_ID: "TEAM123456",
    REZLEE_APPLE_ENCRYPTION_KEY: key,
    REZLEE_APPLE_CLIENT_SECRET: Buffer.from(JSON.stringify({alg:"ES256",kid:"KEY1234567"})).toString("base64url")+"."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".fixture",
  });
  const claims = { iss: "TEAM123456", sub: config.clientId, aud: "https://appleid.apple.com", iat: sec, exp: sec+3600 };
  assert.equal(appleConfig(env(claims), now).clientId, config.clientId);
  for (const patch of [{exp:sec+100},{sub:"other-client"},{iss:"OTHER12345"},{iat:sec+500},{exp:sec+15777001}]) assert.throws(()=>appleConfig(env({...claims,...patch}),now),AppleGrantProblem);
  assert.throws(()=>appleConfig(env(claims,"bad"),now),AppleGrantProblem);
});
test("encrypted grants cannot be moved between users, client IDs or token hashes", () => {
  const encrypted = sealAppleGrant(privateToken, "owner", config);
  assert.ok(!encrypted.cipher.includes(privateToken));
  assert.equal(openAppleGrant(encrypted.cipher, "owner", config.clientId, encrypted.tokenHash, config.encryptionKey), privateToken);
  for (const [user, client, hash] of [["other",config.clientId,encrypted.tokenHash],["owner","other-client",encrypted.tokenHash],["owner",config.clientId,"a".repeat(64)]]) {
    assert.throws(()=>openAppleGrant(encrypted.cipher,user,client,hash,config.encryptionKey));
  }
  assert.throws(()=>openAppleGrant(encrypted.cipher,"owner",config.clientId,encrypted.tokenHash,Buffer.alloc(32,8)));
});
test("token validation sends secrets only to Apple's fixed endpoint and verifies the returned identity", async () => {
  const signed = await identity(); let calls = 0;
  const request = (async (url, init) => {
    calls++; assert.equal(url,"https://appleid.apple.com/auth/token"); assert.equal(init?.redirect,"error"); assert.ok(init?.signal);
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("refresh_token"),privateToken); assert.equal(body.get("client_id"),config.clientId);
    return Response.json({ id_token:signed.token, refresh_token:"rotated-fixture-token" });
  }) as typeof fetch;
  const result = await validateAppleGrant(privateToken,config,request,(token,client)=>verifiedAppleSubject(token,client,signed.key));
  assert.equal(result.subject,"apple-owner");assert.deepEqual(result.tokens,[privateToken,"rotated-fixture-token"]);assert.equal(calls,1);
  for (const status of [400,401,429,500]) await assert.rejects(validateAppleGrant(privateToken,config,async()=>new Response(null,{status})),AppleGrantProblem);
  await assert.rejects(validateAppleGrant(privateToken,config,async()=>{throw Error(privateToken);}),e=>e instanceof AppleGrantProblem&&!e.message.includes(privateToken));
});
test("oversized and malformed token responses are rejected with a bounded reader", async () => {
  await assert.rejects(readBoundedJson(new Response("x".repeat(50)),40),AppleGrantProblem);
  await assert.rejects(readBoundedJson(new Response("{broken")),AppleGrantProblem);
  await assert.rejects(validateAppleGrant(privateToken,config,async()=>Response.json({id_token:42})),AppleGrantProblem);
});
function storeFixture(subject: string | null = "apple-owner", saveError: {code:string}|null = null) {
  const saved: unknown[] = [];
  const admin = { auth: { admin: { getUserById: async () => ({data:{user:{id:"owner",identities:subject?[{provider:"apple",identity_data:{sub:subject}}]:[]}},error:null}) } },
    from: (table: string) => ({upsert:async(rows:unknown,options:unknown)=>{assert.equal(table,"apple_auth_grants");saved.push({rows,options});return{error:saveError};}}),
  } as unknown as SupabaseClient;
  return {admin,saved};
}
test("only a grant cryptographically bound to the authenticated user's Apple identity is retained", async () => {
  const good = storeFixture();
  const deps = {config:()=>config,validate:async()=>({subject:"apple-owner",tokens:[privateToken]})};
  await retainAppleGrant(good.admin,"owner",privateToken,deps);
  assert.equal(good.saved.length,1);assert.ok(!JSON.stringify(good.saved).includes(privateToken));
  for (const subject of ["different-apple-user",null]) {
    const bad = storeFixture(subject);await assert.rejects(retainAppleGrant(bad.admin,"owner",privateToken,deps),AppleGrantProblem);assert.equal(bad.saved.length,0);
  }
  const wrongUser = storeFixture();await assert.rejects(retainAppleGrant(wrongUser.admin,"foreign-user",privateToken,deps));assert.equal(wrongUser.saved.length,0);
  await assert.rejects(retainAppleGrant(storeFixture().admin,"owner","bad token",deps),AppleGrantProblem);
  await assert.rejects(retainAppleGrant(storeFixture("apple-owner",{code:"42501"}).admin,"owner",privateToken,deps),e=>e instanceof AppleGrantProblem&&e.status===423);
});
function deletionFixture(options: {empty?:boolean;foreign?:boolean;revokeFails?:boolean;deleteFails?:boolean;client?:string} = {}) {
  let present = !options.empty;
  const encrypted = sealAppleGrant(privateToken,"owner",config), calls: string[] = [];
  const row = {id:"grant",user_id:options.foreign?"other":"owner",client_id:options.client??config.clientId,token_hash:encrypted.tokenHash,token_cipher:encrypted.cipher};
  const admin = {from:()=>{let remove=false;const query={
    select:()=>query,order:()=>query,limit:()=>query,eq:(k:string,v:string)=>{if(k==="user_id")assert.equal(v,"owner");return query;},
    maybeSingle:async()=>({data:present?row:null,error:null}),delete:()=>{remove=true;return query;},
    then:(resolve:(v:unknown)=>unknown)=>{if(remove){calls.push("delete");if(!options.deleteFails)present=false;}return Promise.resolve({error:options.deleteFails?{}:null}).then(resolve);},
  };return query;}} as unknown as SupabaseClient;
  const deps = {config:()=>config,decrypt:openAppleGrant,revoke:async(token:string)=>{assert.equal(token,privateToken);calls.push("revoke");if(options.revokeFails)throw new DeletionProblem("provider_unavailable");}};
  return {admin,deps,calls};
}
test("Apple revocation precedes erasure and successful replay does no external work", async () => {
  const f=deletionFixture();
  assert.equal(await revokeAppleForDeletion(f.admin,"owner",f.deps),false);assert.deepEqual(f.calls,["revoke","delete"]);
  assert.equal(await revokeAppleForDeletion(f.admin,"owner",f.deps),true);assert.deepEqual(f.calls,["revoke","delete"]);
});
test("failed Apple revocation, foreign ownership and wrong-client ciphertext cannot erase a grant", async () => {
  for(const options of [{revokeFails:true},{foreign:true},{client:"other-client"}]) {
    const f=deletionFixture(options);await assert.rejects(revokeAppleForDeletion(f.admin,"owner",f.deps));assert.ok(!f.calls.includes("delete"));
  }
  const old=deletionFixture({empty:true});
  old.deps.config=()=>{throw Error("No new sign-ins configured");};
  assert.equal(await revokeAppleForDeletion(old.admin,"owner",old.deps),true);
});
test("crash after Apple revocation retains the grant and retries revocation before erasure", async () => {
  const f=deletionFixture({deleteFails:true});
  await assert.rejects(revokeAppleForDeletion(f.admin,"owner",f.deps));
  await assert.rejects(revokeAppleForDeletion(f.admin,"owner",f.deps));
  assert.deepEqual(f.calls,["revoke","delete","revoke","delete"]);
});
test("Apple revocation accepts only explicit HTTP 200 and never puts credentials in a URL", async () => {
  await revokeAppleToken(privateToken,config,async(url,init)=>{
    assert.equal(url,"https://appleid.apple.com/auth/revoke");assert.equal(init?.redirect,"error");assert.ok(init?.signal);
    assert.equal((init?.body as URLSearchParams).get("token"),privateToken);return new Response(null,{status:200});
  });
  for(const status of [204,302,400,401,403,404,429,500])await assert.rejects(revokeAppleToken(privateToken,config,async()=>new Response(null,{status})),DeletionProblem);
  assert.equal(appleGrantHash(privateToken).length,64);
});
