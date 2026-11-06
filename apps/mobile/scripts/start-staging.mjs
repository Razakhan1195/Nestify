import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
const mobile = fileURLToPath(new URL("../", import.meta.url));
const required = ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"];
const values = Object.fromEntries(readFileSync(new URL("../../../.env.mobile-staging.local", import.meta.url), "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
if (required.some(key => !values[key])) throw new Error("Staging configuration is incomplete.");
if (new URL(values.EXPO_PUBLIC_SUPABASE_URL).hostname !== "gjwvalpxnfbvryosmcbj.supabase.co") throw new Error("Staging must use the isolated test database.");
if (new URL(values.EXPO_PUBLIC_API_URL).origin !== "https://staging.rezlee.com") throw new Error("Unexpected staging API.");
const key = values.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!key.startsWith("sb_publishable_") && JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role !== "anon") throw new Error("Only a public Supabase key belongs in the mobile app.");
await new Promise(resolve => {
 const probe = createServer();
 probe.once("error", error => {
  console.error(error.code === "EADDRINUSE"
   ? "Port 8081 is already in use. Reuse the running staging server or stop it before restarting. Rezlee will not switch ports automatically."
   : "Could not open staging port 8081. Check that the port is available and try again.");
  process.exit(1);
 });
 probe.listen(8081, "0.0.0.0", () => probe.close(resolve));
});
const expoGo = process.argv.includes("--go");
const env = { ...process.env, EXPO_NO_DOTENV: "1", REZLEE_STAGING_PROFILE: "1", EXPO_PUBLIC_SOCIAL_AUTH_READY: "true", EXPO_PUBLIC_EMAIL_CODE_READY: "true" };
for (const name of required) env[name] = values[name];
console.log(`Rezlee staging: staging.rezlee.com · port 8081 · ${expoGo ? "Expo Go (use email sign-in; Google requires the Rezlee build)" : "Rezlee development build"}. Service availability follows staging settings.`);
const require = createRequire(new URL("../package.json", import.meta.url));
const child = spawn(process.execPath, [require.resolve("expo/bin/cli"), "start", expoGo ? "--go" : "--dev-client", "--lan", "--port", "8081", "--clear"], { cwd: mobile, env, stdio: "inherit" });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
