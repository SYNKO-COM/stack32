import { expect, test } from "@playwright/test";

import { waitForSignupOtp } from "./helpers/inbucket";

/**
 * Core Phase 2 journey against the LOCAL Supabase stack:
 * signup → verify email (OTP via Inbucket) → onboarding → agent creation →
 * builder message persisted → logout → login → data still there.
 */

// Satisfies local Supabase policy: lower_upper_letters_digits_symbols, min 10.
const password = "E2e-Password-123!";

test("signup, verify email, onboarding, build, logout and login again", async ({ page }) => {
  const email = `e2e-${Date.now()}@stack32.test`;

  // --- Signup ---------------------------------------------------------------
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: /create account|créer mon compte/i }).click();

  // --- Verify email (enable_confirmations = true) -----------------------------
  // Signup returns no session, so the app routes to /verify-email; confirm with
  // the 6-digit OTP delivered to Inbucket.
  await page.waitForURL("**/verify-email**", { timeout: 20_000 });
  const otp = await waitForSignupOtp(email);
  const firstDigit = page.getByLabel(/digit 1/i);
  await firstDigit.click();
  await page.keyboard.type(otp);

  // --- Onboarding (3 steps) ---------------------------------------------------
  await page.waitForURL("**/onboarding", { timeout: 20_000 });
  // Intro animation, then step 1 (options targeted by label to avoid clicking
  // a leaving step during the animated transition).
  await page.getByRole("radio", { name: /google/i }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /continue|continuer/i }).click();
  await page.getByRole("radio", { name: /founder|fondateur/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /continue|continuer/i }).click();
  await page.locator("#onboarding-firstname").fill("E2E");
  await page.getByRole("button", { name: /finish|start|terminer|commencer/i }).click();

  // --- Fresh agent workspace ---------------------------------------------------
  await page.waitForURL("**/agents/*/build", { timeout: 30_000 });

  // --- Builder message persists --------------------------------------------
  const composer = page.locator("textarea").first();
  await composer.fill("Build me a research agent");
  await composer.press("Enter");
  await expect(page.getByText("Build me a research agent")).toBeVisible({ timeout: 10_000 });

  // Mock build simulation completes server-side and the polling UI
  // eventually shows the ready assistant response.
  await expect(page.getByText(/ready|prêt/i).first()).toBeVisible({
    timeout: 30_000,
  });

  // --- Logout ------------------------------------------------------------------
  await page.getByRole("button", { name: /user menu|menu utilisateur/i }).click();
  await page.getByRole("menuitem", { name: /log ?out|se déconnecter/i }).click();
  await page.waitForURL(/\/$|\/login/, { timeout: 15_000 });

  // Protected route is no longer accessible.
  await page.goto("/agents");
  await page.waitForURL("**/login**", { timeout: 15_000 });

  // --- Login again: data persisted ------------------------------------------
  await page.getByLabel(/email/i).fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: /sign in|se connecter/i }).click();
  await page.waitForURL("**/agents**", { timeout: 20_000 });
  await expect(page.getByText(/research agent/i).first()).toBeVisible({ timeout: 15_000 });
});

test("unauthenticated users are redirected away from protected routes", async ({ page }) => {
  await page.goto("/agents");
  await page.waitForURL("**/login**", { timeout: 15_000 });
  await page.goto("/onboarding");
  await page.waitForURL("**/login**", { timeout: 15_000 });
});
