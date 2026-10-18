import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`public pages fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["/", "/features", "/pricing", "/faq", "/contact", "/login"]) {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
      await expect.poll(
        () => page.evaluate(() => document.documentElement.scrollWidth),
        { message: `${route} should not scroll horizontally at ${width}px` },
      ).toBeLessThanOrEqual(width);
    }
  });
}

test("phone navigation exposes every public section and remains touchable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: /ouvrir le menu|open menu/i });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(40);
  await menu.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("link", { name: /tarifs|pricing/i })).toBeVisible();
  await drawer.getByRole("link", { name: /tarifs|pricing/i }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("phone header controls do not overlap", async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/");
    const controls = await page.evaluate(() => {
      const links = [...document.querySelectorAll('header a[aria-label="Stack32"]')];
      const logo = links.find((link) => getComputedStyle(link).display !== "none" && link.getBoundingClientRect().width > 0 && link.getBoundingClientRect().height > 0);
      const cta = [...document.querySelectorAll("header button")].find((button) => /commencer|get started/i.test(button.textContent ?? "") && button.getBoundingClientRect().width > 0);
      return { logoRight: logo?.getBoundingClientRect().right ?? 0, ctaLeft: cta?.getBoundingClientRect().left ?? 0 };
    });
    expect(controls.logoRight, `${width}px: logo should end before the CTA`).toBeLessThan(controls.ctaLeft);
  }
});

test("tablet navigation stays in its drawer; desktop links stay visible", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /ouvrir le menu|open menu/i })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("button", { name: /ouvrir le menu|open menu/i })).toBeHidden();
  await expect(page.getByRole("navigation", { name: /navigation principale|main navigation/i }).getByRole("link", { name: /tarifs|pricing/i })).toBeVisible();
});

test("phone form fields use a readable size without triggering iOS zoom", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const email = page.getByLabel(/email/i);
  await expect(email).toBeVisible();
  const fontSize = await email.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
});

test("onboarding advances single choices and keeps progress and back fixed while scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto("/onboarding");
  const goal = page.getByRole("radio", { name: /save time|gagner du temps/i });
  await expect(goal).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^(step|étape) \d+ (of|sur) 9$/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(continue|continuer)$/i })).toHaveCount(0);
  await goal.dblclick();
  const founder = page.getByRole("radio", { name: /^(founder|fondateur)$/i });
  await expect(founder).toBeVisible();
  const back = page.getByRole("button", { name: /^(back|retour)$/i });
  const progress = page.getByRole("progressbar");
  const before = await progress.boundingBox();
  const backBox = await back.boundingBox();
  expect(backBox!.y).toBeGreaterThan(before!.y + before!.height);
  await back.click();
  await expect(goal).toHaveAttribute("aria-checked", "true");
  await goal.click();
  await expect(founder).toBeVisible();
  const other = page.getByRole("radio", { name: /^(other|autre)$/i });
  await other.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const scrolledProgress = await progress.boundingBox();
  expect(Math.abs(scrolledProgress!.y - before!.y)).toBeLessThanOrEqual(1);
  expect((await page.locator("header").boundingBox())!.y).toBe(0);
  await other.click();
  await expect(page.locator("#onboarding-idea")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const next = page.getByRole("button", { name: /^(continue|continuer)$/i });
  await next.scrollIntoViewIfNeeded();
  const nextBox = await next.boundingBox();
  expect(Math.abs(nextBox!.x + nextBox!.width / 2 - 195)).toBeLessThanOrEqual(1);
  expect(nextBox!.width).toBeGreaterThanOrEqual(240);
  expect(nextBox!.height).toBeGreaterThanOrEqual(48);
  const actions = await page.getByTestId("onboarding-actions").evaluate((element) => ({ position: getComputedStyle(element).position, background: getComputedStyle(element).backgroundColor }));
  expect(actions).toEqual({ position: "static", background: "rgba(0, 0, 0, 0)" });
});
