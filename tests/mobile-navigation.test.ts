import assert from "node:assert/strict";
import test from "node:test";

import { safeBack } from "../apps/mobile/src/lib/navigation";

test("safeBack uses history when available", () => {
  const calls: string[] = [];
  const router = {
    canGoBack: () => true,
    back: () => calls.push("back"),
    replace: (href: never) => calls.push(`replace:${String(href)}`),
  };

  safeBack(router, "/(tabs)/home");

  assert.deepEqual(calls, ["back"]);
});

test("safeBack replaces with a fallback when there is no navigation history", () => {
  const calls: string[] = [];
  const router = {
    canGoBack: () => false,
    back: () => calls.push("back"),
    replace: (href: never) => calls.push(`replace:${String(href)}`),
  };

  safeBack(router, "/(tabs)/bills");

  assert.deepEqual(calls, ["replace:/(tabs)/bills"]);
});


test("mobile app uses the Expo Router SDK 56+ navigation entry points", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { join } = await import("node:path");
  for (const folder of ["../apps/mobile/app/", "../apps/mobile/src/"]) {
    const root = fileURLToPath(new URL(folder, import.meta.url));
    const files = await readdir(root, { recursive: true });
    for (const file of files.filter(name => /\.[cm]?[jt]sx?$/.test(name))) {
      const source = await readFile(join(root, file), "utf8");
      assert.doesNotMatch(source, /["']@react-navigation\//, `${file}: import from expo-router entry points instead`);
    }
  }
});
