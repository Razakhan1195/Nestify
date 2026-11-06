import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
const platform = process.argv[2];
if (!["ios", "android"].includes(platform)) throw Error("Choose ios or android.");
const values = parseEnv(readFileSync(new URL("../../../.env.mobile-staging.local", import.meta.url), "utf8"));
const profile = process.argv[3] ?? (platform === "ios" ? "beta" : "staging-android");
if (profile !== "beta" && !(platform === "android" && profile === "staging-android")) throw Error("Choose a staging beta build profile.");
const env = { ...process.env, EXPO_NO_DOTENV: "1", EAS_BUILD_PROFILE: profile };
for (const name of ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]) env[name] = values[name];
const require = createRequire(import.meta.url);
require("./release-config.cjs").validateReleaseConfig(env);
console.log(`Building ${platform} for staging. This does not submit or publish to a store.`);
const child = spawn("npx", ["--yes", "eas-cli", "build", "--platform", platform, "--profile", profile], {
  cwd: fileURLToPath(new URL("../", import.meta.url)), env, stdio: "inherit",
});
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", () => { console.error("Could not start EAS. Check your terminal and Expo account access."); process.exitCode = 1; });
