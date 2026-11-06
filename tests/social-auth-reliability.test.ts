import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

type Session = { user: { id: string }; access_token: string; refresh_token: string };
type Harness = {
  auth: {
    startSocialSignIn(provider: "google" | "apple"): Promise<{ cancelled: boolean }>;
    completeSocialSignIn(url: string): Promise<void>;
    cancelSocialSignIn(): Promise<void>;
    socialProviders(): Promise<{ google: boolean; apple: boolean }>;
    releasedSocialProviders(): { google: boolean; apple: boolean };
  };
  state: {
    store: Map<string, string>;
    browserCalls: number;
    grantCalls: number;
    providerRefreshToken: string | null;
    grant(url: string, init?: RequestInit): Promise<Response>;
    sessionWrites: number;
    lookup(): Promise<Response>;
    beforeWrite(key: string): Promise<void>;
    beforeStart(): Promise<void>;
    beforeExchange(): Promise<void>;
    getSession(): Promise<{ data: { session: Session | null } }>;
    browser(url: string): Promise<{ type: string; url?: string }>;
  };
};
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const attemptKey = "rezlee.social.attempt.v1";
const attemptId = "11111111-1111-4111-8111-111111111111";
function callback(h: Harness, provider: "google" | "apple" = "google") {
  h.state.store.set(attemptKey, JSON.stringify({ version: 1, id: attemptId, provider, createdAt: Date.now(), flowId: "fixture-flow" }));
  return "rezlee://auth-return?attempt=" + attemptId + "&sb_flow_id=fixture-flow&code=fixture-code";
}
async function withHarness(run: (h: Harness) => Promise<void>, options: { apple?: boolean; expoGo?: boolean } = {}) {
  const work = await mkdtemp(join(tmpdir(), "rezlee-auth-races-"));
  const originalFetch = globalThis.fetch;
  const fixture = `
    export const state = {
      store: new Map(), browserCalls: 0, sessionWrites: 0, grantCalls: 0, providerRefreshToken: "fixture-apple-refresh",
      grant: async () => Response.json({saved:true}),
      lookup: async () => new Response(JSON.stringify({external:{google:true,apple:true}}),{status:200}),
      beforeWrite: async () => {}, beforeStart: async () => {}, beforeExchange: async () => {},
      getSession: async () => ({data:{session:null}}),
      browser: async () => ({type:"cancel"})
    };
  `;
  const stubs: Record<string, string> = {
    "fixture": fixture,
    "expo-constants": `export const ExecutionEnvironment={StoreClient:"storeClient"};export default {executionEnvironment:"${options.expoGo ? "storeClient" : "standalone"}"};`,
    "expo": "export const requireOptionalNativeModule=()=>({});",
    "expo-crypto": 'export {randomUUID} from "node:crypto";',
    "expo-secure-store": 'import{state as s}from"fixture";export const getItemAsync=async k=>s.store.get(k)??null;export const setItemAsync=async(k,v)=>{await s.beforeWrite(k);s.store.set(k,v)};export const deleteItemAsync=async k=>{s.store.delete(k)};',
    "@/lib/supabase": 'import{state as s}from"fixture";export const supabase={auth:{getSession:()=>s.getSession(),setSession:async()=>{s.sessionWrites++;return{error:null}}}};',
    "expo-web-browser": 'import{state as s}from"fixture";export async function openAuthSessionAsync(url){s.browserCalls++;return s.browser(url)};',
    "@supabase/supabase-js": `import{state as s}from"fixture";export function createClient(){return{auth:{
      signInWithOAuth:async({options})=>{await s.beforeStart();s.store.set("rezlee.social.pkce.v1-flows-code-verifier",JSON.stringify(["fixture-flow"]));s.store.set("rezlee.social.pkce.v1-flow-fixture-flow-code-verifier","fixture-verifier");const r=new URL(options.redirectTo);r.searchParams.set("sb_flow_id","fixture-flow");return{data:{url:"https://oauth-test.invalid/authorize?redirect_to="+encodeURIComponent(r.toString())},error:null}},
      exchangeCodeForSession:async()=>{await s.beforeExchange();return{data:{session:{access_token:"fixture-access",refresh_token:"fixture-refresh",provider_refresh_token:s.providerRefreshToken,user:{id:"fixture-user"}}},error:null}}
    }}}`
  };
  try {
    const output = join(work, "scenario.cjs");
    await build({
      stdin: { contents: `export * as auth from ${JSON.stringify(resolve("apps/mobile/src/auth/social-auth.ts"))}; export {state} from "fixture";`, resolveDir: process.cwd(), loader: "ts" },
      outfile: output, bundle: true, platform: "node", format: "cjs",
      define: {
        "process.env.EXPO_PUBLIC_API_URL": '"https://rezlee-api-test.invalid"',
        "process.env.EXPO_PUBLIC_SOCIAL_AUTH_READY": '"true"',
        "process.env.EXPO_PUBLIC_APPLE_AUTH_READY": JSON.stringify(String(options.apple ?? false)),
        "process.env.EXPO_PUBLIC_SUPABASE_URL": '"https://oauth-test.invalid"',
        "process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY": '"fixture-public-key"'
      },
      plugins: [{ name: "auth-boundaries", setup(b) {
        b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: "fixture" } : undefined);
        b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: stubs[a.path], loader: "js" }));
      } }]
    });
    const h = createRequire(import.meta.url)(output) as Harness;
    globalThis.fetch = (url, init) => {
      if (String(url).endsWith("/api/mobile/v1/auth/apple/grant")) {
        h.state.grantCalls++;
        assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer fixture-access");
        assert.deepEqual(JSON.parse(String(init?.body)),{refreshToken:h.state.providerRefreshToken});
        return h.state.grant(String(url),init);
      }
      return h.state.lookup();
    };
    await run(h);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(work, { recursive: true, force: true });
  }
}

test("cancelling during provider lookup prevents a late browser handoff and permits retry", () => withHarness(async h => {
  const entered = deferred(), release = deferred<Response>();
  h.state.lookup = () => { entered.resolve(); return release.promise; };
  const pending = h.auth.startSocialSignIn("google");
  await entered.promise;
  await h.auth.cancelSocialSignIn();
  release.resolve(new Response(JSON.stringify({ external: { google: true } })));
  assert.deepEqual(await pending, { cancelled: true });
  assert.equal(h.state.browserCalls, 0);
  assert.equal(h.state.store.size, 0);
  h.state.lookup = async () => new Response(JSON.stringify({ external: { google: true } }));
  assert.deepEqual(await h.auth.startSocialSignIn("google"), { cancelled: true });
  assert.equal(h.state.browserCalls, 1);
}));

for (const stage of ["secure storage", "provider initialization"] as const) {
  test("cancelling during " + stage + " leaves no pending attempt or browser", () => withHarness(async h => {
    const entered = deferred(), release = deferred();
    if (stage === "secure storage") h.state.beforeWrite = async key => { if (key === attemptKey) { entered.resolve(); await release.promise; } };
    else h.state.beforeStart = async () => { entered.resolve(); await release.promise; };
    const pending = h.auth.startSocialSignIn("google");
    await entered.promise;
    await h.auth.cancelSocialSignIn();
    release.resolve();
    assert.deepEqual(await pending, { cancelled: true });
    assert.equal(h.state.browserCalls, 0);
    assert.equal(h.state.store.size, 0);
  }));
}

test("rapid duplicate starts open only one provider browser", () => withHarness(async h => {
  const entered = deferred(), release = deferred<{ type: string }>();
  h.state.browser = () => { entered.resolve(); return release.promise; };
  const pending = h.auth.startSocialSignIn("google");
  await entered.promise;
  await assert.rejects(h.auth.startSocialSignIn("google"), /already in progress/);
  release.resolve({ type: "cancel" });
  await pending;
  assert.equal(h.state.browserCalls, 1);
}));

test("retry cannot destroy an account sign-in whose callback is being exchanged", () => withHarness(async h => {
  const entered = deferred(), release = deferred();
  h.state.beforeExchange = async () => { entered.resolve(); await release.promise; };
  const pending = h.auth.completeSocialSignIn(callback(h));
  const outcome = pending.then(() => null, e => e);
  await entered.promise;
  await assert.rejects(h.auth.startSocialSignIn("google"), /already in progress/);
  release.resolve();
  assert.equal(await outcome, null);
  assert.equal(h.state.sessionWrites, 1);
}));

for (const stage of ["provider exchange", "final account check"] as const) {
  test("cancellation during " + stage + " cannot adopt a late session", () => withHarness(async h => {
    const entered = deferred(), release = deferred();
    if (stage === "provider exchange") h.state.beforeExchange = async () => { entered.resolve(); await release.promise; };
    else {
      let reads = 0;
      h.state.getSession = async () => { if (++reads === 2) { entered.resolve(); await release.promise; } return { data: { session: null } }; };
    }
    const pending = h.auth.completeSocialSignIn(callback(h));
    const outcome = pending.then(() => null, e => e);
    await entered.promise;
    const cancelled = h.auth.cancelSocialSignIn();
    release.resolve();
    assert.ok(await outcome instanceof Error);
    await cancelled;
    assert.equal(h.state.sessionWrites, 0);
    assert.equal(h.state.store.size, 0);
  }));
}

test("an established account is never replaced by a duplicate callback", () => withHarness(async h => {
  h.state.getSession = async () => ({ data: { session: { user: { id: "existing-user" }, access_token: "existing-access", refresh_token: "existing-refresh" } } });
  await h.auth.completeSocialSignIn(callback(h));
  assert.equal(h.state.sessionWrites, 0);
}));

test("provider exchange failure clears the attempt without exposing provider detail", () => withHarness(async h => {
  h.state.beforeExchange = async () => { throw Error("private provider payload"); };
  await assert.rejects(h.auth.completeSocialSignIn(callback(h)), { message: "We couldn’t finish sign-in. Please start again." });
  assert.equal(h.state.store.size, 0);
  assert.equal(h.state.sessionWrites, 0);
  assert.deepEqual(await h.auth.startSocialSignIn("google"), { cancelled: true });
}));

test("Google remains available while Apple's independent lifecycle gate is off", () => withHarness(async h => {
  assert.deepEqual(await h.auth.socialProviders(), { google: true, apple: false });
  await assert.rejects(h.auth.startSocialSignIn("apple"), /unavailable/);
  assert.equal(h.state.browserCalls, 0);
}));
test("Apple needs both the client release gate and server provider setting", () => withHarness(async h => {
  assert.deepEqual(await h.auth.socialProviders(), { google: true, apple: true });
  h.state.lookup = async () => new Response(JSON.stringify({ external: { google: true, apple: false } }));
  assert.deepEqual(await h.auth.socialProviders(), { google: true, apple: false });
}, { apple: true }));
test("Expo Go keeps social options hidden without a settings request", () => withHarness(async h => {
  h.state.lookup = async () => { throw Error("Expo Go must not fetch"); };
  assert.deepEqual(await h.auth.socialProviders(), { google: false, apple: false });
}, { apple: true, expoGo: true }));

test("Apple callback retains the verified grant before adopting the session",()=>withHarness(async h=>{
 await h.auth.completeSocialSignIn(callback(h,"apple"));
 assert.equal(h.state.grantCalls,1);assert.equal(h.state.sessionWrites,1);assert.equal(h.state.store.size,0);
},{apple:true}));
test("failed Apple retention never adopts a session or exposes upstream credentials",()=>withHarness(async h=>{
 h.state.grant=async()=>{throw Error("private provider secret");};
 await assert.rejects(h.auth.completeSocialSignIn(callback(h,"apple")),{message:"We couldn’t finish sign-in. Please start again."});
 assert.equal(h.state.sessionWrites,0);assert.equal(h.state.store.size,0);
},{apple:true}));
test("a missing Apple provider refresh token cannot silently skip retention",()=>withHarness(async h=>{
 h.state.providerRefreshToken=null;
 await assert.rejects(h.auth.completeSocialSignIn(callback(h,"apple")));
 assert.equal(h.state.grantCalls,0);assert.equal(h.state.sessionWrites,0);
},{apple:true}));
for(const scenario of ["cancel","switch-account"] as const){
 test("Apple retention completing after "+scenario+" cannot replace the current session",()=>withHarness(async h=>{
  const entered=deferred(), release=deferred<Response>();
  h.state.grant=()=>{entered.resolve();return release.promise;};
  const pending=h.auth.completeSocialSignIn(callback(h,"apple"));
  const outcome=pending.then(()=>null,e=>e);
  await entered.promise;
  const cancelled=scenario==="cancel"?h.auth.cancelSocialSignIn():Promise.resolve();
  if(scenario==="switch-account")h.state.getSession=async()=>({data:{session:{user:{id:"different-user"},access_token:"different",refresh_token:"different"}}});
  release.resolve(Response.json({saved:true}));assert.ok(await outcome instanceof Error);await cancelled;
  assert.equal(h.state.sessionWrites,0);assert.equal(h.state.store.size,0);
 },{apple:true}));
}


test("verified social buttons are available before discovery and survive a transport failure", () => withHarness(async h => {
 h.state.lookup = async () => { throw Error("Network unavailable"); };
 assert.deepEqual(h.auth.releasedSocialProviders(), {google:true,apple:true});
 await assert.rejects(h.auth.socialProviders());
 assert.deepEqual(h.auth.releasedSocialProviders(), {google:true,apple:true});
}, {apple:true}));
test("immediate provider display still respects Apple and native-browser release gates", () => withHarness(async h => {
 assert.deepEqual(h.auth.releasedSocialProviders(), {google:true,apple:false});
}));
test("Expo Go cannot show release-only social controls", () => withHarness(async h => {
 assert.deepEqual(h.auth.releasedSocialProviders(), {google:false,apple:false});
}, {apple:true,expoGo:true}));
