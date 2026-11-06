import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";

const buildId = process.argv[2];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(buildId || "")) {
  console.error("Provide the completed iOS beta build ID. This command never selects a different build automatically.");
  process.exit(1);
}
const values = parseEnv(readFileSync(new URL("../../../.env.mobile-staging.local", import.meta.url), "utf8"));
const env = { ...process.env, EXPO_NO_DOTENV: "1", EAS_BUILD_PROFILE: "beta" };
for (const name of ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]) env[name] = values[name];
createRequire(import.meta.url)("./release-config.cjs").validateReleaseConfig(env);
console.log("Uploading the selected iPhone build to App Store Connect for TestFlight. This does not release it publicly.");
const child = spawn("npx", ["--yes", "eas-cli", "submit", "--platform", "ios", "--profile", "beta", "--id", buildId], {
  cwd: fileURLToPath(new URL("../", import.meta.url)), env, stdio: "inherit",
});
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", () => { console.error("Could not start EAS Submit. Check your terminal and Expo account access."); process.exitCode = 1; });
