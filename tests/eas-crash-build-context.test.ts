import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const {crashConfig}=createRequire(import.meta.url)("../apps/mobile/scripts/crash-config.cjs");
test("EAS local config may omit server-only token; actual builds and standalone exports fail closed",()=>{
 const env={EXPO_PUBLIC_SENTRY_DSN:"https://"+"a".repeat(32)+"@o123.ingest.us.sentry.io/456",SENTRY_ORG:"rezlee",SENTRY_PROJECT:"mobile"};
 assert.throws(()=>crashConfig(env,"production"));
 assert.equal(crashConfig({...env,EAS_BUILD_PROFILE:"production"},"production").enabled,true);
 assert.throws(()=>crashConfig({...env,EAS_BUILD_PROFILE:"production",EAS_BUILD:"true"},"production"));
 assert.equal(crashConfig({...env,EAS_BUILD_PROFILE:"production",EAS_BUILD:"true",SENTRY_AUTH_TOKEN:"fixture-server-token"},"production").enabled,true);
});
