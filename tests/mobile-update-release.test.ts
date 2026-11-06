import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { authStorageKey } from "../apps/mobile/src/lib/auth-storage-key";
const {validateReleaseConfig}=createRequire(import.meta.url)("../apps/mobile/scripts/release-config.cjs");
const ref="eynbuhmtxkigvqoewbwi";
const key=(project:string,role="anon")=>`x.${Buffer.from(JSON.stringify({role,ref:project})).toString("base64url")}.x`;
const production={EAS_BUILD_PROFILE:"production-candidate",EXPO_PUBLIC_API_URL:"https://rezlee.com",EXPO_PUBLIC_SUPABASE_URL:"https://auth.rezlee.com",EXPO_PUBLIC_SUPABASE_ANON_KEY:key(ref),EXPO_PUBLIC_SOCIAL_AUTH_READY:"true",EXPO_PUBLIC_APPLE_AUTH_READY:"true",EXPO_PUBLIC_EMAIL_CODE_READY:"true"};
test("branded production auth preserves the existing project session and PKCE namespace",()=>{
 assert.equal(authStorageKey("https://auth.rezlee.com"),authStorageKey(`https://${ref}.supabase.co`));
 assert.equal(authStorageKey("https://auth.rezlee.com"),`sb-${ref}-auth-token`);
 assert.notEqual(authStorageKey("https://gjwvalpxnfbvryosmcbj.supabase.co"),authStorageKey("https://auth.rezlee.com"));
});
test("production candidate accepts branded domain only with production API and project JWT",()=>{
 assert.equal(validateReleaseConfig(production),"production");
 for(const patch of [{EXPO_PUBLIC_API_URL:"https://staging.rezlee.com"},{EXPO_PUBLIC_SUPABASE_ANON_KEY:key("gjwvalpxnfbvryosmcbj")},{EXPO_PUBLIC_SUPABASE_ANON_KEY:key(ref,"service_role")},{EXPO_PUBLIC_SUPABASE_URL:"https://auth.rezlee.com.attacker.example"},{EXPO_PUBLIC_SUPABASE_URL:"https://gjwvalpxnfbvryosmcbj.supabase.co"}]) assert.throws(()=>validateReleaseConfig({...production,...patch}));
});
test("staging cannot use production branded authentication",()=>{
 assert.throws(()=>validateReleaseConfig({...production,EAS_BUILD_PROFILE:"apple-beta",EXPO_PUBLIC_API_URL:"https://staging.rezlee.com"}));
});
test("testing binaries cannot subscribe to public production updates",()=>{
 const eas=JSON.parse(readFileSync(new URL("../apps/mobile/eas.json",import.meta.url),"utf8"));
 function profile(name:string):Record<string,unknown>{const p=eas.build[name];return {...(p.extends?profile(p.extends):{}),...p};}
 for(const name of ["preview","beta","apple-beta","staging-android","apple-staging-android"]) assert.equal(profile(name).channel,"staging");
 assert.equal(profile("production-candidate").channel,"production-candidate");
 assert.equal(profile("production-candidate").environment,"production");
 assert.equal(profile("production").channel,"production");
 const app=JSON.parse(readFileSync(new URL("../apps/mobile/app.json",import.meta.url),"utf8")).expo;
 assert.deepEqual(app.runtimeVersion,{policy:"fingerprint"});
 assert.equal(app.updates.url,`https://u.expo.dev/${app.extra.eas.projectId}`);
 assert.equal(app.updates.fallbackToCacheTimeout,0,"startup must not wait on downloading updates");
});

test("cloud candidate update fails closed without production identity or source-map credentials",()=>{
 const script=fileURLToPath(new URL("../apps/mobile/scripts/validate-update.cjs",import.meta.url));
 const env={...production,SENTRY_ORG:"rezlee",SENTRY_PROJECT:"rezlee-mobile",SENTRY_AUTH_TOKEN:"synthetic-test-only",EXPO_PUBLIC_SENTRY_DSN:"https://"+ "a".repeat(32)+"@o1.ingest.us.sentry.io/123"};
 const run=(patch:Record<string,string|undefined>)=>spawnSync(process.execPath,[script],{env:{...env,...patch,NODE_ENV:"test"},encoding:"utf8"});
 assert.equal(run({}).status,0);
 for(const patch of [{EAS_BUILD_PROFILE:"production"},{SENTRY_AUTH_TOKEN:""},{EXPO_PUBLIC_API_URL:"https://staging.rezlee.com"},{EXPO_PUBLIC_SUPABASE_ANON_KEY:key("gjwvalpxnfbvryosmcbj")},{SENTRY_PROJECT:""},{EXPO_PUBLIC_SENTRY_DSN:""}]) {
  const result=run(patch);assert.notEqual(result.status,0);assert.ok(result.stderr.trim(),"failure must explain the rejected configuration");
 }
});
