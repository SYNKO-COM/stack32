import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
});

// Actual control UI in Chromium, explicitly simulated device API and Chrome APIs.
// This proves disclosure/confirmation sequencing, not a live Stack32 pairing.
async function fixture() {
  const context = await browser.newContext();
  const results = [];
  let delivered = false;
  await context.addInitScript(() => {
    window.readFixture = "Only requested test content";
    window.chrome = {
      tabs: {
        get: async () => ({ url: "https://test.example" }),
        onRemoved: { addListener() {} },
        onUpdated: { addListener() {} },
      },
      scripting: {
        executeScript: async () => [
          {
            documentId: "document-one",
            result: { status: "read", text: window.readFixture },
          },
        ],
      },
    };
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "control.example") {
      const name = url.pathname.slice(1);
      const allowed = [
        "control.html",
        "control.css",
        "control.js",
        "page.js",
        "icons/48.png",
      ];
      assert.ok(allowed.includes(name));
      return route.fulfill({
        body: await readFile(new URL("../" + name, import.meta.url)),
        contentType: name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : name.endsWith(".png")
              ? "image/png"
              : "text/html",
      });
    }
    assert.equal(
      url.hostname,
      "stack32-agent-api-preprod-spxecrm6bq-ew.a.run.app",
    );
    let body = {};
    if (url.pathname.endsWith("/pair"))
      body = {
        token: "a".repeat(64),
        agent_name: "Fixture agent",
        origin: "https://test.example",
        expires_at: new Date(Date.now() + 900000).toISOString(),
      };
    else if (url.pathname.endsWith("/poll")) {
      body = {
        origin: "https://test.example",
        commands: delivered
          ? []
          : [
              {
                id: "fixture-command",
                expires_at: new Date(Date.now() + 60000).toISOString(),
                action: {
                  kind: "read",
                  selector: "#task-region",
                  purpose: "Read only the requested region",
                },
              },
            ],
      };
      delivered = true;
    } else if (url.pathname.endsWith("/result"))
      results.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
      },
    });
  });
  const page = await context.newPage();
  await page.goto(
    "https://control.example/control.html?tab=1&origin=https%3A%2F%2Ftest.example",
  );
  await page.locator("#code").fill("b".repeat(64));
  await page.locator("#connect").click();
  await page.locator("#command").waitFor({ state: "visible" });
  return { context, page, results };
}

test("a page read stays local until the exact displayed snapshot is approved", async () => {
  const { context, page, results } = await fixture();
  try {
    assert.match(
      await page.locator("#preview").textContent(),
      /Only requested test content/,
    );
    assert.equal(results.length, 0);
    await page.locator("#approve").click();
    await page.locator("#command").waitFor({ state: "hidden" });
    await page.waitForFunction(
      () => !document.querySelector("#approve").disabled,
    );
    assert.deepEqual(results, [
      { status: "read", text: "Only requested test content" },
    ]);
  } finally {
    await context.close();
  }
});
test("a changed read cannot disclose data under an earlier confirmation", async () => {
  const { context, page, results } = await fixture();
  try {
    await page.evaluate(() => {
      window.readFixture = "UNAPPROVED CHANGED DATA";
    });
    await page.locator("#approve").click();
    await page.locator("#pair").waitFor({ state: "visible" });
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "failed");
    assert.doesNotMatch(JSON.stringify(results), /UNAPPROVED/);
  } finally {
    await context.close();
  }
});
test("denying a read reports refusal without disclosing page text", async () => {
  const { context, page, results } = await fixture();
  try {
    await page.locator("#deny").click();
    await page.locator("#pair").waitFor({ state: "visible" });
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "denied");
    assert.doesNotMatch(JSON.stringify(results), /Only requested/);
  } finally {
    await context.close();
  }
});
