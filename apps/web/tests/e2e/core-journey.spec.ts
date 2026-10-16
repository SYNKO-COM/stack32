import { expect, test, type Page } from "@playwright/test";

import { waitForSignupOtp } from "./helpers/inbucket";

/**
 * Core Phase 2 journey against the LOCAL Supabase stack:
 * signup → verify email (OTP via Inbucket/Mailpit) → onboarding → agent creation →
 * builder message persisted → logout → login → data still there.
 */

// Satisfies local Supabase policy: lower_upper_letters_digits_symbols, min 10.
const password = "E2e-Password-123!";

async function reachBuilderComposer(page: Page): Promise<void> {
  const composer = page.getByTestId("builder-composer");

  // Prefer an explicit post-onboarding build URL.
  try {
    await page.waitForURL(/\/agents\/[^/]+\/build/, { timeout: 45_000 });
  } catch {
    // Onboarding may have landed on /agents empty state (no auto-create).
    await page.goto("/agents");
  }

  // Empty-state CTA when no agent exists yet.
  if (!(await composer.isVisible().catch(() => false))) {
    const createCta = page.getByRole("button", {
      name: /create|créer|new agent|nouvel agent|get started|commencer/i,
    });
    if (await createCta.isVisible().catch(() => false)) {
      await createCta.click();
    }
  }

  // If we have an agent URL without /build, open Build.
  const agentMatch = page.url().match(/\/agents\/([^/?#]+)/);
  if (agentMatch && !page.url().includes("/build")) {
    await page.goto(`/agents/${agentMatch[1]}/build`);
  }

  // Layout can show BrandLoader while agent/workspace queries settle.
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await expect(composer).toBeEnabled({ timeout: 15_000 });
}

test("signup, verify email, onboarding, build, logout and login again", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = `e2e-${Date.now()}@stack32.test`;
  const username = `e2e_${Date.now().toString().slice(-8)}`;

  // --- Signup ---------------------------------------------------------------
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: /create account|créer mon compte/i }).click();

  // --- Verify email ---------------------------------------------------------
  await page.waitForURL(/\/(verify-email|onboarding)/, { timeout: 30_000 });
  if (page.url().includes("/verify-email")) {
    const otp = await waitForSignupOtp(email);
    for (let index = 0; index < otp.length; index += 1) {
      const digit = page.getByLabel(new RegExp(`digit ${index + 1}$`, "i"));
      await digit.fill(otp[index]!);
      await expect(digit).toHaveValue(otp[index]!);
    }
    await page.waitForURL("**/onboarding", { timeout: 30_000 });
  }

  // --- Onboarding -----------------------------------------------------------
  await page.getByRole("radio", { name: /google/i }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /continue|continuer/i }).click();
  await page.getByRole("radio", { name: /founder|fondateur/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /continue|continuer/i }).click();
  await page.locator("#onboarding-firstname").fill("E2E");
  await page.locator("#onboarding-username").fill(username);
  await expect(page.getByText(/available|disponible/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /continue|continuer/i }).click();
  await page.locator("#onboarding-workspace").fill("E2E Workspace");
  await page.getByRole("button", { name: /finish|start|terminer|commencer|créer/i }).click();

  // --- Plan picker (same as homepage signup / first prompt) -----------------
  await page.waitForURL("**/billing/plans**", { timeout: 30_000 });
  await page.getByRole("button", { name: /start for free|commencer gratuitement/i }).click();

  // --- Builder --------------------------------------------------------------
  await reachBuilderComposer(page);

  const composer = page.getByTestId("builder-composer");
  await composer.fill("Build me a research agent");
  await composer.press("Enter");
  await expect(page.getByText("Build me a research agent")).toBeVisible({ timeout: 15_000 });

  // Mock build simulation completes server-side and the polling UI
  // eventually shows the ready assistant response.
  await expect(page.getByText(/ready|prêt/i).first()).toBeVisible({
    timeout: 45_000,
  });

  // The phone drawer must disappear after navigating to another workspace page.
  const builderUrl = page.url();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole("button", { name: /toggle agent list|afficher.*agents/i }).click();
  const mobileDrawer = page.getByRole("dialog", { name: /ai agents|agents ia/i });
  await expect(mobileDrawer).toBeVisible();
  await mobileDrawer.getByRole("link", { name: /my agents|mes agents/i }).click();
  await expect(page).toHaveURL(/\/agents\/library/);
  await expect(mobileDrawer).toBeHidden();
  await page.goto(builderUrl.replace(/\/build$/, "/settings"));
  const iconButton = page.getByRole("button", { name: "pen-line" });
  await expect(iconButton).toBeVisible();
  const iconBox = await iconButton.boundingBox();
  expect(iconBox).not.toBeNull();
  expect(iconBox!.x + iconBox!.width).toBeLessThanOrEqual(320);
  await page.goto(builderUrl);
  await page.setViewportSize({ width: 1280, height: 720 });

  // --- Logout ---------------------------------------------------------------
  await page.getByRole("button", { name: /user menu|menu utilisateur/i }).click();
  await page.getByRole("menuitem", { name: /log ?out|se déconnecter/i }).click();
  await page.waitForURL(/\/$|\/login/, { timeout: 15_000 });

  await page.goto("/agents");
  await page.waitForURL("**/login**", { timeout: 15_000 });

  // --- Login again: data persisted ------------------------------------------
  await page.getByLabel(/email/i).fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: /sign in|se connecter/i }).click();
  await page.waitForURL("**/agents**", { timeout: 20_000 });
  await expect(page.getByText(/research agent/i).first()).toBeVisible({ timeout: 20_000 });
});

test("unauthenticated users are redirected away from protected routes", async ({ page }) => {
  await page.goto("/agents");
  await page.waitForURL("**/login**", { timeout: 15_000 });
  await page.goto("/onboarding");
  await page.waitForURL("**/login**", { timeout: 15_000 });
  await page.goto("/my-agents");
  await page.waitForURL("**/login**", { timeout: 15_000 });
});

test("logged-out public agent landing stays public (not a forced login)", async ({ page }) => {
  await page.goto("/@missinguser/missing-agent");
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  // Missing agent → not-found UI with Stack32 chrome (login available, no forced redirect).
  await expect(page).not.toHaveURL(/\/login/);
});
