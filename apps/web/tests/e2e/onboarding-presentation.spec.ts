import { expect, test, devices, type Page } from "@playwright/test";
const { defaultBrowserType, ...phone } = devices["iPhone 13"];
void defaultBrowserType;
async function at(page: Page, step: string) { await expect(page.getByTestId("mobile-onboarding")).toHaveAttribute("data-step", step, { timeout: 20_000 }); }
async function next(page: Page, name = "Continuer") { await page.getByRole("button", { name, exact: true }).click(); }
async function choose(page: Page, label: string) { await page.getByRole("radio", { name: label, exact: true }).click(); await next(page); }

test("mobile presentation: transparent fixed header, compact gauge and distinct learning scenes", async ({ browser }) => {
  test.setTimeout(100_000);
  const context = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 }, locale: "fr-FR", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto("http://localhost:3100/onboarding"); await at(page, "definition");
    expect(await page.locator("header").evaluate(e => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await next(page, "J'ai compris"); await choose(page, "Lancer un business d'agents IA"); await choose(page, "Jamais");
    await next(page); await next(page, "Construire mon projet"); await choose(page, "Moins de 2 h"); await choose(page, "Cette semaine"); await at(page, "b.target");
    await expect(page.getByText(/Ambitieux|Accessible|Difficulté indicative/)).toHaveCount(0);
    const range = await page.locator("#income-target").boundingBox();
    const label = await page.getByText("60 000 €", { exact: true }).boundingBox();
    expect(label!.y - (range!.y + range!.height)).toBeLessThanOrEqual(4);
    await page.screenshot({ path: test.info().outputPath("compact-gauge.png") });
    await next(page); await choose(page, "Un complément"); await at(page, "b.analysis");
    const progress = page.getByTestId("circular-preparation").getByRole("progressbar");
    expect(Number(await progress.getAttribute("aria-valuenow"))).toBeLessThan(15);
    await at(page, "b.suggestions"); await next(page, "Voir comment en faire une offre");
    await choose(page, "Je le crée pour un client"); await choose(page, "Mon réseau");
    for (const step of ["b.clients", "b.describe", "b.configure", "b.present"]) {
      await at(page, step); await expect(page.getByTestId(`learning-${step}`)).toBeVisible();
      const headerY = await page.locator("header").evaluate(e => e.getBoundingClientRect().top);
      const progressY = await page.getByRole("progressbar", { name: "Progression du parcours" }).evaluate(e => e.getBoundingClientRect().top);
      await page.getByTestId("journey-scroll").evaluate(e => { e.scrollTop = e.scrollHeight; });
      expect(await page.locator("header").evaluate(e => e.getBoundingClientRect().top)).toBe(headerY);
      expect(await page.getByRole("progressbar", { name: "Progression du parcours" }).evaluate(e => e.getBoundingClientRect().top)).toBe(progressY);
      await page.getByTestId("journey-scroll").evaluate(e => { e.scrollTop = 0; });
      await page.screenshot({ path: test.info().outputPath(`${step}.png`) });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await next(page);
    }
    await at(page, "account");
    await page.setViewportSize({ width: 320, height: 640 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await expect(page.getByLabel(/email/i)).toBeVisible();
  } finally { await context.close(); }
});
