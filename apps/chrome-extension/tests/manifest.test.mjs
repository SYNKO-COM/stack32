import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const extension = fileURLToPath(new URL("..", import.meta.url));
test("the actual MV3 package loads, has no target-site grant and renders its control window", async () => {
  const profile = await mkdtemp(join(tmpdir(), "stack32-extension-test-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    await context.route("https://**/*", (r) => r.abort());
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    const permissions = await worker.evaluate(() =>
      chrome.permissions.getAll(),
    );
    assert.deepEqual(permissions.origins, [
      "https://stack32-agent-api-preprod-spxecrm6bq-ew.a.run.app/*",
    ]);
    assert.deepEqual(
      new Set(permissions.permissions),
      new Set(["activeTab", "scripting"]),
    );
    const tab = await worker.evaluate(() =>
      chrome.tabs.create({ url: "https://browser-test.example" }),
    );
    const denied = await worker.evaluate(async (tabId) => {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => document.title,
        });
        return false;
      } catch {
        return true;
      }
    }, tab.id);
    assert.equal(denied, true, "no selected-tab gesture means no access");
    const control = await context.newPage();
    await control.setViewportSize({ width: 1280, height: 800 });
    await control.goto(
      `chrome-extension://${id}/control.html?tab=${tab.id}&origin=https%3A%2F%2Fbrowser-test.example`,
    );
    await control.locator("#connect").waitFor();
    assert.match(
      await control.locator("#connect").textContent(),
      /Link|Relier/,
    );
    assert.equal(await control.locator("#command").isVisible(), false);
    await control.screenshot({
      path: fileURLToPath(
        new URL(
          "../../../docs/chrome/screenshots/01-connect.png",
          import.meta.url,
        ),
      ),
    });
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
