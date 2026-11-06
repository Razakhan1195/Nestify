const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToString } = require("react-dom/server");
const esbuild = require("esbuild");
const { chromium } = require("/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core");

const root = process.cwd();
const out = path.join(root, "docs/qa/release-lint-20261012");
const pageFile = path.join(root, "src/app/join-household/page.tsx");

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({
    entryPoints: [pageFile], outfile: path.join(out, "invitation-server.cjs"),
    bundle: true, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  });
  const Page = require(path.join(out, "invitation-server.cjs")).default;
  const markup = renderToString(React.createElement(Page));
  assert.match(markup, /Loading your invitation/);
  assert.doesNotMatch(markup, /link is incomplete|rezlee:\/\/household/);
  await esbuild.build({
    stdin: {
      contents: 'import React from "react";import {hydrateRoot} from "react-dom/client";import Page from ' + JSON.stringify(pageFile) + ';hydrateRoot(document.getElementById("root"),React.createElement(Page));',
      resolveDir: root, loader: "tsx",
    },
    outfile: path.join(out, "invitation.js"), bundle: true, platform: "browser",
    format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  });
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === "/invitation.js") {
      res.setHeader("Content-Type", "application/javascript");
      return res.end(fs.readFileSync(path.join(out, "invitation.js")));
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Household invitation</title></head><body style="margin:0"><div id="root">' + markup + '</div><script src="/invitation.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const checks = [{ scenario: "server-render-safe-loading", pass: true }];
  try {
    browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
    const origin = "http://127.0.0.1:" + server.address().port;
    const a = "a".repeat(64), b = "b".repeat(64);
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(5000);
      const errors = [], external = [];
      page.on("pageerror", err => errors.push(err.message));
      page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
        external.push(route.request().url());
        return route.abort();
      });
      const link = page.getByRole("link", { name: "Open invitation in Rezlee" });
      const invalid = page.getByText("This invitation link is incomplete. Ask the sender for a new link.", { exact: true });
      for (const [scenario, hash] of [
        ["missing", ""], ["malformed", "#token=invalid"], ["truncated", "#token=" + a.slice(1)],
        ["non-hex", "#token=" + "g".repeat(64)], ["valid", "#token=" + a],
      ]) {
        await page.goto(origin + "/join-household" + hash);
        if (scenario === "valid") {
          await link.waitFor();
          assert.equal(await link.getAttribute("href"), "rezlee://household/join?token=" + a);
          assert.equal(await invalid.count(), 0);
        } else {
          await invalid.waitFor();
          assert.equal(await link.count(), 0);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        checks.push({ scenario, width, pass: true });
      }
      await page.evaluate(hash => { window.location.hash = hash; }, "token=" + b);
      await page.waitForFunction(token => document.querySelector("a")?.getAttribute("href")?.endsWith(token), b);
      checks.push({ scenario: "changed-fragment-replaces-link", width, pass: true });
      await page.goBack();
      await page.waitForFunction(token => document.querySelector("a")?.getAttribute("href")?.endsWith(token), a);
      checks.push({ scenario: "back-restores-first-invitation", width, pass: true });
      await page.goForward();
      await page.waitForFunction(token => document.querySelector("a")?.getAttribute("href")?.endsWith(token), b);
      checks.push({ scenario: "forward-restores-second-invitation", width, pass: true });
      await page.screenshot({ path: path.join(out, "invitation-valid-" + width + ".png"), fullPage: true });
      await page.evaluate(() => { window.location.hash = "token=invalid"; });
      await invalid.waitFor();
      assert.equal(await link.count(), 0);
      checks.push({ scenario: "invalid-fragment-removes-stale-link", width, pass: true });
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      checks.push({ scenario: "no-hydration-errors-or-external-requests", width, pass: true });
      await page.close();
    }
    assert.equal(requests.some(url => url.includes(a) || url.includes(b)), false);
    checks.push({ scenario: "fragment-token-not-sent-to-server", pass: true });
    const report = {
      passed: checks.length, checks,
      boundaries: "Actual web invitation page server-rendered and hydrated in local Chrome; fictional tokens only. No invitation sent, native handoff, household API, or provider request.",
    };
    fs.writeFileSync(path.join(out, "invitation-results.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ passed: checks.length, out }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
