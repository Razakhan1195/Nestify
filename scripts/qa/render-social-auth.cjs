/* Actual mobile login/component render checks with simulated auth transport only. */
const fs = require("node:fs"), assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { chromium } = require("/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core");
const root = process.cwd(), deps = "/tmp/rezlee-bill-qa-tools-20261008/node_modules";
const out = root + "/docs/qa/auth-reliability-20261012";
const stubs = {
  "expo-haptics": 'export const impactAsync=async()=>{};export const ImpactFeedbackStyle={Light:"Light"};',
  "expo-router": 'const router={replace:d=>window.__routes.push(d),push:d=>window.__routes.push(d),canGoBack:()=>false};export const useRouter=()=>router;export const useLocalSearchParams=()=>({});',
  "expo-router/react-navigation": "export const usePreventRemove=()=>{};",
  "react-native-safe-area-context": 'export {View as SafeAreaView} from "react-native";',
  "@expo/vector-icons": 'import React from "react";export const Feather=()=> <span aria-hidden="true">←</span>;',
  "@/lib/public-links": "export const openPublicLink=async()=>{};",
  "@/auth/AuthProvider": 'export const useAuth=()=>({session:null,signIn:async()=>{window.__emailCalls++;return{error:"Fixture email sign-in reached"}}});',
  "@/auth/pending-signup": "export const clearPendingSignup=async()=>{};",
  "@/auth/email-code": "export const emailCodeReady=true;",
  "@/auth/social-auth": `export async function socialProviders(){
    window.__lookupCalls++;
    if(window.__lookupCalls<=window.__failures)throw Error("fixture network unavailable");
    if(window.__holdLookup)return new Promise(r=>window.__lookupResolve=r);
    return{google:!window.__none,apple:false};
  }
  export async function startSocialSignIn(){
    window.__socialCalls++;
    if(window.__holdSignIn)return new Promise(r=>window.__signInResolve=r);
    if(window.__signInError)throw Error("We couldn’t sign you in. Please try again.");
    return{cancelled:true};
  }`
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({
    stdin: {
      contents: 'import React from "react";import{createRoot}from"react-dom/client";import Login from"'+root+'/apps/mobile/app/(auth)/login.tsx";import{SocialSignIn}from"'+root+'/apps/mobile/src/components/SocialSignIn.tsx";createRoot(document.getElementById("root")).render(window.__isolated?<SocialSignIn disabled={false} onBusy={b=>window.__busy.push(b)} onError={e=>window.__errors.push(e)}/>:<Login/>);',
      resolveDir: root, loader: "tsx"
    },
    outfile: out + "/login.js", bundle: true, platform: "browser", format: "iife", jsx: "automatic",
    loader: { ".png": "dataurl" },
    alias: { react: deps + "/react", "react-dom": deps + "/react-dom", "react-native": deps + "/react-native-web" },
    define: { global: "globalThis", "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "auth-boundaries", setup(b) {
      b.onResolve({ filter: /.*/ }, a => {
        if (stubs[a.path]) return { path: a.path, namespace: "fixture" };
        if (a.path.startsWith("@/")) for (const ext of [".ts", ".tsx", "/index.ts"]) {
          const candidate = root + "/apps/mobile/src/" + a.path.slice(2) + ext;
          if (fs.existsSync(candidate)) return { path: candidate };
        }
      });
      b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: stubs[a.path], loader: "tsx", resolveDir: root }));
    } }]
  });
  const server = require("node:http").createServer((req, res) => {
    if (req.url === "/login.js") { res.setHeader("Content-Type", "application/javascript; charset=utf-8"); return res.end(fs.readFileSync(out + "/login.js")); }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/login.js"></script>');
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const checks = [];
  try {
    for (const width of [320, 390, 1280]) for (const scenario of ["retry", "email-fallback", "cancel", "provider-error", "no-providers", "double-tap"]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(7000);
      const errors = [], external = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => { external.push(route.request().url()); return route.abort(); });
      await page.addInitScript(scenario => {
        window.__lookupCalls = 0; window.__socialCalls = 0; window.__emailCalls = 0;
        window.__routes = []; window.__busy = []; window.__errors = [];
        window.__failures = scenario === "retry" ? 1 : scenario === "email-fallback" ? 10 : 0;
        window.__none = scenario === "no-providers"; window.__isolated = scenario === "double-tap";
        window.__holdSignIn = scenario === "double-tap"; window.__signInError = scenario === "provider-error";
      }, scenario);
      await page.goto("http://127.0.0.1:" + server.address().port);
      const button = name => page.getByRole("button", { name, exact: true });
      if (scenario !== "double-tap") await page.getByRole("heading", { name: "Welcome back" }).waitFor();
      if (scenario === "retry") {
        await button("Retry sign-in options").waitFor();
        await page.getByLabel("Email", { exact: true }).fill("fixture@example.invalid");
        await page.getByLabel("Password", { exact: true }).fill("fixture-password");
        await page.screenshot({ path: out + "/lookup-error-" + width + ".png", fullPage: true });
        await page.evaluate(() => { window.__holdLookup = true; });
        await button("Retry sign-in options").click();
        await page.getByText("Checking sign-in options…", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button").filter({ has: page.getByRole("progressbar") }).isDisabled(), true);
        assert.equal(await page.getByLabel("Email", { exact: true }).isEnabled(), true);
        await page.waitForFunction(() => Boolean(window.__lookupResolve));
        await page.evaluate(() => window.__lookupResolve({ google: true, apple: false }));
        await button("Continue with Google").waitFor();
        assert.equal(await button("Retry sign-in options").count(), 0);
        assert.equal(await page.getByLabel("Email", { exact: true }).inputValue(), "fixture@example.invalid");
        assert.equal(await page.getByLabel("Password", { exact: true }).inputValue(), "fixture-password");
        assert.equal(await page.evaluate(() => window.__lookupCalls), 2);
      } else if (scenario === "email-fallback") {
        await button("Retry sign-in options").waitFor();
        await button("Retry sign-in options").click();
        await page.getByText("Other sign-in options couldn’t load. You can use email or try again.", { exact: true }).waitFor();
        await page.getByLabel("Email", { exact: true }).fill("fixture@example.invalid");
        await page.getByLabel("Password", { exact: true }).fill("fixture-password");
        await button("Sign in").click();
        await page.getByText("Fixture email sign-in reached", { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.__emailCalls), 1);
      } else if (scenario === "no-providers") {
        await page.waitForFunction(() => window.__lookupCalls === 1);
        assert.equal(await button("Continue with Google").count(), 0);
        assert.equal(await button("Continue with Apple").count(), 0);
        assert.equal(await button("Retry sign-in options").count(), 0);
        assert.equal(await page.getByLabel("Email", { exact: true }).isEnabled(), true);
      } else if (scenario === "double-tap") {
        await button("Continue with Google").waitFor();
        await button("Continue with Google").evaluate(b => { b.click(); b.click(); });
        await page.waitForFunction(() => Boolean(window.__signInResolve));
        assert.equal(await page.evaluate(() => window.__socialCalls), 1);
        await page.evaluate(() => window.__signInResolve({ cancelled: true }));
        await page.waitForFunction(() => window.__busy.at(-1) === false);
        assert.deepEqual(await page.evaluate(() => window.__busy), [true, false]);
      } else {
        await button("Continue with Google").click();
        if (scenario === "provider-error") await page.getByRole("alert").filter({ hasText: "We couldn’t sign you in" }).waitFor();
        await page.waitForFunction(() => !document.querySelector('input[aria-label="Email"]').disabled);
        assert.equal(await button("Continue with Google").isEnabled(), true);
        await button("Continue with Google").click();
        assert.equal(await page.evaluate(() => window.__socialCalls), 2);
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: out + "/" + scenario + "-" + width + ".png", fullPage: true });
      checks.push({ width, scenario, pass: true });
      await page.close();
    }
    const result = { passed: checks.length, checks, boundary: "Actual mobile Login, SocialSignIn, AuthFrame, Button and TextField through React Native Web. Simulated auth/native boundaries; external requests blocked. Not installed-device OAuth acceptance." };
    fs.writeFileSync(out + "/render-results.json", JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ passed: checks.length, out }));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
