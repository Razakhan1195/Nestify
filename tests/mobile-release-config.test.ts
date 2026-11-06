import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { validateReleaseConfig } = createRequire(import.meta.url)("../apps/mobile/scripts/release-config.cjs");
const env={EAS_BUILD_PROFILE:"staging-android",EXPO_PUBLIC_API_URL:"https://staging.rezlee.com",EXPO_PUBLIC_SUPABASE_URL:"https://gjwvalpxnfbvryosmcbj.supabase.co",EXPO_PUBLIC_SUPABASE_ANON_KEY:"sb_publishable_fixture"};
test("staging build requires matching staging API/database", () => {assert.equal(validateReleaseConfig(env),"staging");assert.throws(()=>validateReleaseConfig({...env,EXPO_PUBLIC_API_URL:"https://rezlee.com"}));});
test("production refuses staging and missing config", () => {assert.throws(()=>validateReleaseConfig({...env,EAS_BUILD_PROFILE:"production"}));assert.throws(()=>validateReleaseConfig({EAS_BUILD_PROFILE:"production"}));});
test("server keys cannot be included in a release", () => {assert.throws(()=>validateReleaseConfig({...env,EXPO_PUBLIC_SUPABASE_ANON_KEY:"sb_secret_invalid"}));const key=`x.${Buffer.from(JSON.stringify({role:"service_role",ref:"gjwvalpxnfbvryosmcbj"})).toString("base64url")}.x`;assert.throws(()=>validateReleaseConfig({...env,EXPO_PUBLIC_SUPABASE_ANON_KEY:key}));});
test("existing local development is preserved", () => {assert.equal(validateReleaseConfig({}),null);});

test("release manifest removes overlay permission without changing development or other permission choices", () => {
 const configure=createRequire(import.meta.url)("../apps/mobile/app.config.js");
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 try {
  Object.assign(process.env,env);
  const config={name:"Rezlee",android:{package:"com.rezlee.app",blockedPermissions:["android.permission.RECORD_AUDIO"]}};
  const release=configure({config});
  assert.deepEqual(release.android.blockedPermissions,["android.permission.RECORD_AUDIO","android.permission.SYSTEM_ALERT_WINDOW"]);
  assert.equal(release.android.package,"com.rezlee.app");
  delete process.env.EAS_BUILD_PROFILE;
  assert.deepEqual(configure({config}).android,config.android);
 } finally {for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});


test("Apple profiles enforce the same staging boundary and unknown profiles fail closed", () => {
 for (const profile of ["apple-beta", "apple-staging-android"]) {
  assert.equal(validateReleaseConfig({...env,EAS_BUILD_PROFILE:profile}),"staging");
  assert.throws(()=>validateReleaseConfig({...env,EAS_BUILD_PROFILE:profile,EXPO_PUBLIC_API_URL:"https://rezlee.com"}));
 }
 assert.throws(()=>validateReleaseConfig({...env,EAS_BUILD_PROFILE:"unreviewed-release"}));
 assert.equal(validateReleaseConfig({EAS_BUILD_PROFILE:"development"}),null);
});


test("production cannot silently ship without the verified sign-in options",()=>{
 const production={EAS_BUILD_PROFILE:"production",EXPO_PUBLIC_API_URL:"https://rezlee.com",EXPO_PUBLIC_SUPABASE_URL:"https://eynbuhmtxkigvqoewbwi.supabase.co",EXPO_PUBLIC_SUPABASE_ANON_KEY:"sb_publishable_fixture",EXPO_PUBLIC_SOCIAL_AUTH_READY:"true",EXPO_PUBLIC_APPLE_AUTH_READY:"true",EXPO_PUBLIC_EMAIL_CODE_READY:"true"};
 assert.equal(validateReleaseConfig(production),"production");
 for(const key of ["EXPO_PUBLIC_SOCIAL_AUTH_READY","EXPO_PUBLIC_APPLE_AUTH_READY","EXPO_PUBLIC_EMAIL_CODE_READY"])assert.throws(()=>validateReleaseConfig({...production,[key]:undefined}),/sign-in options/);
});
