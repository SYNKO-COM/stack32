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
