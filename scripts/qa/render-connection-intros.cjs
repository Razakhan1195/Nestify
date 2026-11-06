const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { chromium } = require("/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core");
const root = process.cwd(), deps = "/tmp/rezlee-bill-qa-tools-20261008/node_modules";
const out = root + "/docs/qa/connection-intros-20261012";
const stubs = {
  "expo-router": `import React from "react";const router={push:d=>window.__routes.push(d),replace:d=>window.__routes.push(d),canGoBack:()=>false,back:()=>window.__routes.push("back")};export const useRouter=()=>router;export const useLocalSearchParams=()=>window.__params;export const useFocusEffect=fn=>React.useEffect(fn,[fn]);export const Redirect=({href})=>{React.useEffect(()=>{window.__routes.push(href)},[href]);return null};export const Stack={Screen:({options})=>options.header?.()??null};`,
  "react-native-safe-area-context": 'export {View as SafeAreaView} from "react-native";',
  "react-native": 'export * from "react-native-web";export const AppState={currentState:"active",addEventListener:()=>({remove(){}})};',
  "react-native-webview": `import React from "react";import{View,Text}from"react-native";export const WebView=React.forwardRef((props,ref)=>{window.__web=props;React.useImperativeHandle(ref,()=>({injectJavaScript:s=>window.__injections.push(s)}));return <View><Text>External sign-in screen</Text></View>});`,
  "expo-haptics": 'export const impactAsync=async()=>{},notificationAsync=async()=>{},selectionAsync=async()=>{};export const ImpactFeedbackStyle={Light:"Light"};export const NotificationFeedbackType={Success:"Success"};',
  "@expo/vector-icons": `import React from"react";export const Feather=({name,size=20,color})=><svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" style={{flexShrink:0}}>{name==="x"?<path d="M6 6l12 12M6 18L18 6"/>:name==="mail"?<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></>:name==="check-square"?<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/></>:name==="square"?<rect x="3" y="3" width="18" height="18" rx="2"/>:name==="sliders"?<><path d="M5 3v18M12 3v18M19 3v18M2 8h6M9 16h6M16 7h6"/></>:<path d="m9 5 7 7-7 7"/>}</svg>;`,
  "@/auth/AuthProvider": 'export const useAuth=()=>({session:{user:{id:window.__user}}});',
  "@/lib/api": `export class ApiError extends Error{};export const apiDelete=async()=>{throw Error("Unexpected API delete")},apiFormPost=async()=>{throw Error("Unexpected API upload")},apiPatch=async()=>{throw Error("Unexpected API patch")};export const apiGet=async()=>{window.__gets++;if(window.__loadError)throw Error("Couldn’t check your email connection. Try again.");if(window.__deferGet)return new Promise(r=>window.__getResolve=r);return structuredClone(window.__gmail)};export const apiPost=async(_,body)=>{window.__actions.push(body);return{}};`,
  "@/lib/gmail-connection": `export const connectGmail=async(homeId,categories)=>{window.__gmailCalls.push({homeId,categories});if(window.__deferGmail)return new Promise(r=>window.__gmailResolve=r);if(window.__gmailSuccess){window.__gmail.link=window.__link("active");return true}return false};`,
  "@/lib/provider-data": `export const providerCategories=["Electricity","Natural gas","Water","Internet","Mobile","Other service"];export const fetchProviderConnections=async()=>{if(window.__deferCatalog)return new Promise(r=>window.__catalogResolve=r);if(window.__catalogError)throw Error("offline");return{catalog:window.__catalog,deckTesting:true}};export const fetchProviderConnection=async()=>{if(window.__existingError)throw Error("offline");if(window.__deferExisting)return new Promise(r=>window.__existingResolve=r);return{provider:window.__provider}};export const connectProviderRequest=async body=>{window.__legacyCalls.push(body);return{providerId:"connected"}};`,
  "@/lib/deck-hosted-auth": `export const DECK_AUTH_ORIGIN="https://auth.components.deck.co";export const startHostedAuth=async body=>{window.__deckCalls.push(body);if(window.__deferDeck)return new Promise(r=>window.__deckResolve=r);return window.__deckReady};export const checkHostedAuth=async()=>({status:"pending"});export const completeHostedAuth=async()=>({status:"completed",providerId:"connected-bell"});export const isDeckAuthUrl=()=>true;export const hostedInitScript=()=>"fixture";export const hostedMessage=data=>JSON.parse(data);`,
  "@/lib/ezgb-data": `export const fetchEzgbAuthorization=async()=>{window.__greenCalls++;if(window.__greenError)throw Error("offline");if(window.__deferGreen)return new Promise(r=>window.__greenResolve=r);return{authorizationUrl:"https://example.invalid/consent"}};export const syncEzgb=async()=>{window.__syncCalls++;return window.__sync};export const fetchEzgbSyncStatus=async()=>{window.__statusCalls++;return window.__sync};`,
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const [name, screen] of [["deck", "provider/deck"], ["green", "provider/ezgb"], ["gmail", "gmail-memory"]]) {
    await esbuild.build({
      stdin: { contents: `import React from"react";import{createRoot}from"react-dom/client";import Screen from"${root}/apps/mobile/app/${screen}.tsx";function Fixture(){const[,set]=React.useState(0);window.__rerender=()=>set(n=>n+1);return <Screen/>}createRoot(document.getElementById("root")).render(<Fixture/>);`, resolveDir: root, loader: "tsx" },
      outfile: out + "/" + name + ".js", bundle: true, platform: "browser", format: "iife", jsx: "automatic", loader: { ".png": "dataurl", ".jpg": "dataurl" },
      alias: { react: deps + "/react", "react-dom": deps + "/react-dom", "react-native-web": deps + "/react-native-web" },
      define: { global: "globalThis", "process.env.NODE_ENV": '"development"' },
      plugins: [{ name: "boundaries", setup(b) {
        b.onResolve({ filter: /.*/ }, a => {
          if (stubs[a.path]) return { path: a.path, namespace: "stub" };
          if (a.path.startsWith("@/")) {
            const p = root + "/apps/mobile/src/" + a.path.slice(2);
            for (const ext of [".ts", ".tsx", "/index.ts"]) if (fs.existsSync(p + ext)) return { path: p + ext };
          }
        });
        b.onLoad({ filter: /.*/, namespace: "stub" }, a => ({ contents: stubs[a.path], loader: "tsx", resolveDir: root }));
      } }],
    });
  }
  const server = require("node:http").createServer((req, res) => {
    const name = path.basename(req.url.split("?")[0]) || "deck";
    if (name.endsWith(".js")) { res.setHeader("Content-Type", "application/javascript"); return res.end(fs.readFileSync(out + "/" + name)); }
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}#root{height:100vh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/' + name + '.js"></script>');
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const checks = [], origin = "http://127.0.0.1:" + server.address().port;
  const scenarios = ["deck-intro-cancel-history", "deck-reconnect", "deck-unavailable", "deck-offline-retry", "deck-late-account", "deck-account-loading", "green-intro-upload", "green-consent-result", "green-error-retry", "green-resume", "green-late-account", "gmail-intro-categories-cancel", "gmail-skip", "gmail-unavailable", "gmail-reconnect", "gmail-success", "gmail-offline-retry", "gmail-late-account"];
  try {
    for (const width of [320, 390]) for (const scenario of scenarios) {
      const screen = scenario.split("-")[0], page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(6000);
      const errors = []; page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error" && m.text().includes("same key")) errors.push(m.text()); });
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      await page.addInitScript(({ scenario, screen }) => {
        window.__user = "account-a"; window.__params = screen === "deck" ? { registryProviderId: "bell" } : screen === "green" ? { utilityName: "Hydro One" } : {};
        window.__routes = []; window.__deckCalls = []; window.__legacyCalls = []; window.__gmailCalls = []; window.__actions = []; window.__injections = [];
        window.__gets = 0; window.__greenCalls = 0; window.__syncCalls = 0; window.__statusCalls = 0;
        window.__catalog = [{ id: "bell", name: "Bell", utility_type: "Internet", website_url: "https://mybell.bell.ca/", connectionAvailable: true, hostedAuth: true, telecomHistory: true }];
        window.__provider = { name: "Bell", registryProviderId: "bell", websiteUrl: "https://mybell.bell.ca/", category: "Internet", accountNumber: "fixture-account", reconnectAvailable: true, connectionPaused: false };
        window.__deckReady = { status: "ready", token: "fixture-token", intentId: "fixture-intent", origin: "https://auth.components.deck.co", registryProviderId: "bell" };
        window.__sync = { ok: true, ready: false, jobId: "fixture-job", status: "waiting", stats: { accountsSeen: 1, integrationsConnected: 0, billsImported: 0, quarantined: 0, errors: 0 } };
        window.__link = status => ({ id: "fixture-link", email: "home@example.test", status, ongoing: false, categories: ["warranty"], excluded_senders: [], error_code: null, updated_at: "", work: { phase: "complete", processed: 3, proposed: 0, ignored: 3, failed: 0, count: 3, capReached: false, after: 1760000000, before: 1760000001, mode: "initial" } });
        window.__gmail = { enabled: true, homeId: "home-a", homeName: "Your place", scheduleReady: false, pendingCount: 0, suggestions: [], link: null };
        if (scenario === "deck-reconnect" || scenario === "deck-offline-retry" || scenario === "deck-account-loading") window.__params = { providerId: "existing-bell" };
        if (scenario === "deck-unavailable") window.__params = { registryProviderId: "rogers" };
        if (scenario === "deck-offline-retry") window.__existingError = true;
        if (scenario === "deck-account-loading") window.__deferExisting = true;
        if (scenario === "deck-late-account") window.__deferDeck = true;
        if (scenario === "green-error-retry") window.__greenError = true;
        if (scenario === "green-resume") window.__params = { resume: "1" };
        if (scenario === "green-late-account") window.__deferGreen = true;
        if (scenario === "gmail-unavailable") window.__gmail.enabled = false;
        if (scenario === "gmail-reconnect") window.__gmail.link = window.__link("reconnect");
        if (scenario === "gmail-success") window.__gmailSuccess = true;
        if (scenario === "gmail-offline-retry") window.__loadError = true;
        if (scenario === "gmail-late-account") window.__deferGmail = true;
      }, { scenario, screen });
      await page.goto(origin + "/" + screen);
      const button = label => page.getByRole("button", { name: label, exact: true });
      if (screen === "deck") {
        if (scenario === "deck-unavailable") {
          await page.getByText("Connection coming soon", { exact: true }).waitFor();
          assert.equal(await button("Continue with Deck").count(), 0);
          await button("Upload a statement").click();
        } else if (scenario === "deck-account-loading") {
          await page.waitForFunction(() => !!window.__existingResolve);
          assert.equal(await page.getByRole("textbox").count(), 0, "Legacy password form flashed while loading");
          await button("Close").click();
        } else {
          if (scenario === "deck-offline-retry") {
            await page.getByText("Couldn’t load this connection", { exact: true }).waitFor();
            await page.evaluate(() => window.__existingError = false); await button("Try again").click();
          }
          const reconnect = scenario === "deck-reconnect" || scenario === "deck-offline-retry";
          await button(reconnect ? "Reconnect with Deck" : "Continue with Deck").waitFor();
          assert.equal(await page.evaluate(() => window.__deckCalls.length), 0, "Authorization began before consent");
          await page.getByText("Your access, your choice", { exact: true }).waitFor();
          if (scenario === "deck-intro-cancel-history") await page.screenshot({ path: out + "/deck-intro-top-" + width + ".png" });
          await button("Bill history · 6 months").click();
          await page.getByRole("radio", { name: "3 months", exact: true }).click();
          if (scenario === "deck-intro-cancel-history") await page.screenshot({ path: out + "/deck-intro-" + width + ".png" });
          await button(reconnect ? "Reconnect with Deck" : "Continue with Deck").click();
          await page.waitForFunction(() => window.__deckCalls.length === 1);
          const request = await page.evaluate(() => window.__deckCalls[0]);
          assert.equal(request.historyMonths, 3);
          assert.equal(request.registryProviderId, "bell");
          if (reconnect) assert.equal(request.providerId, "existing-bell");
          if (scenario === "deck-late-account") {
            await page.evaluate(() => { window.__user = "account-b"; window.__rerender(); });
            await button("Continue with Deck").waitFor();
            await page.evaluate(() => window.__deckResolve(window.__deckReady));
            await page.waitForTimeout(80);
            assert.equal(await page.getByText("External sign-in screen", { exact: true }).count(), 0);
          } else if (scenario === "deck-intro-cancel-history") {
            await button("Close Bell sign-in").click();
            await page.getByText("Sign-in closed.", { exact: false }).waitFor();
            assert.equal(await page.getByRole("radio", { name: "3 months", exact: true }).getAttribute("aria-checked"), "true");
            await button("Continue with Deck").click();
            await page.getByText("External sign-in screen", { exact: true }).waitFor();
            await page.evaluate(() => window.__web.onMessage({ nativeEvent: { data: JSON.stringify({ type: "SUCCESS", credentialId: "fixture-credential" }), url: "https://auth.components.deck.co" } }));
            await page.waitForFunction(() => window.__routes.includes("/provider/connected-bell"));
          } else {
            await button("Close Bell sign-in").click();
            await button("Upload a bill instead").click();
            assert.deepEqual(await page.evaluate(() => window.__routes.at(-1)), { pathname: "/bill/add", params: { providerName: "Bell", category: "Internet" } });
          }
        }
        assert.equal(await page.evaluate(() => window.__legacyCalls.length), 0);
      } else if (screen === "green") {
        if (scenario === "green-resume") {
          await page.getByText("Your bills aren’t ready yet", { exact: true }).waitFor();
          assert.equal(await page.evaluate(() => window.__greenCalls), 0, "Resuming restarted authorization");
          assert.equal(await page.evaluate(() => window.__statusCalls), 1);
        } else {
          await button("Continue with Green Button").waitFor();
          assert.equal(await page.evaluate(() => window.__greenCalls), 0);
          if (scenario === "green-intro-upload") {
            await page.screenshot({ path: out + "/green-intro-" + width + ".png" });
            await button("Upload a bill instead").click();
            assert.equal(await page.evaluate(() => window.__greenCalls), 0);
          } else {
            await button("Continue with Green Button").click();
            if (scenario === "green-error-retry") {
              await page.getByText("Connection not finished", { exact: true }).waitFor();
              await button("Back to connection details").click();
              assert.equal(await page.evaluate(() => window.__greenCalls), 1);
              await page.evaluate(() => window.__greenError = false);
              await button("Continue with Green Button").click();
            }
            if (scenario === "green-late-account") {
              await page.waitForFunction(() => !!window.__greenResolve);
              await page.evaluate(() => { window.__user = "account-b"; window.__rerender(); });
              await button("Continue with Green Button").waitFor();
              await page.evaluate(() => window.__greenResolve({ authorizationUrl: "https://example.invalid/old-account" }));
              await page.waitForTimeout(80);
              assert.equal(await page.getByText("External sign-in screen", { exact: true }).count(), 0);
            } else {
              await page.getByText("External sign-in screen", { exact: true }).waitFor();
              await page.evaluate(() => window.__web.onMessage({ nativeEvent: { data: JSON.stringify({ type: "ezgb_authorized" }) } }));
              await page.getByText("Your bills aren’t ready yet", { exact: true }).waitFor();
              assert.equal(await page.evaluate(() => window.__syncCalls), 1);
              await button("Go back to Bills").click();
            }
          }
        }
      } else {
        if (scenario === "gmail-offline-retry") {
          await page.getByText("Couldn’t check your email connection. Try again.", { exact: true }).waitFor();
          await page.evaluate(() => window.__loadError = false); await button("Try again").click();
        }
        if (scenario === "gmail-reconnect") {
          await button("Reconnect Gmail").click();
          await page.waitForFunction(() => window.__gmailCalls.length === 1);
          assert.deepEqual(await page.evaluate(() => window.__gmailCalls[0].categories), ["warranty"]);
        } else {
          await button("Continue with Google").waitFor();
          assert.equal(await page.evaluate(() => window.__gmailCalls.length), 0);
          if (scenario === "gmail-unavailable") assert.equal(await button("Continue with Google").isDisabled(), true);
          else if (scenario === "gmail-skip") {
            await button("Not now").click();
            assert.deepEqual(await page.evaluate(() => window.__routes), ["/(tabs)/vault"]);
          } else if (scenario === "gmail-intro-categories-cancel") {
            await page.screenshot({ path: out + "/gmail-intro-" + width + ".png" });
            await button("Choose what Rezlee looks for").click();
            for (const label of ["Bills", "Service invoices", "Home purchases", "Warranties"]) await page.getByRole("checkbox", { name: label, exact: true }).click();
            assert.equal(await button("Continue with Google").isDisabled(), true);
            await page.getByRole("checkbox", { name: "Warranties", exact: true }).click();
            await button("Continue with Google").click();
            await page.getByText("Connection cancelled.", { exact: false }).waitFor();
            assert.deepEqual(await page.evaluate(() => window.__gmailCalls), [{ homeId: "home-a", categories: ["warranty"] }]);
          } else if (scenario === "gmail-late-account") {
            await button("Continue with Google").click(); await page.waitForFunction(() => !!window.__gmailResolve);
            const gets = await page.evaluate(() => window.__gets);
            await page.evaluate(() => { window.__user = "account-b"; window.__gmail.homeId = "home-b"; window.__rerender(); });
            await button("Continue with Google").waitFor();
            await page.evaluate(() => window.__gmailResolve(false)); await page.waitForTimeout(80);
            assert.equal(await page.getByText("Connection cancelled.", { exact: false }).count(), 0, "Previous account completion altered screen");
            assert.equal(await page.evaluate(() => window.__gets), gets + 1, "Previous account completion fetched new account");
          } else if (scenario === "gmail-success") {
            await button("Continue with Google").click();
            await page.getByText("Search complete", { exact: true }).waitFor();
            await page.getByText("No supported home records found", { exact: false }).waitFor();
            assert.equal(await button("Continue with Google").count(), 0, "Intro repeated for connected account");
          }
        }
      }
      assert.deepEqual(errors, [], scenario);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Horizontal overflow: " + scenario);
      checks.push({ width, scenario, pass: true }); await page.close();
    }
    fs.writeFileSync(out + "/results.json", JSON.stringify({ passed: checks.length, checks, boundaries: "Actual entry screens, DeckHostedAuth, shared UI and navigation helper; simulated network, auth, OAuth/WebView, haptics, icon rendering and router. No external connections, emails, pulls or paid calls. Physical native OAuth, keyboards, MFA and screen-reader acceptance remain." }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, out }));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
