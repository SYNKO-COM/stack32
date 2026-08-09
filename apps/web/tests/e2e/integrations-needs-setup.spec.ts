import { expect, test } from "@playwright/test";

/**
 * Hybrid integrations UI smoke — skipped without credentials so CI stays green.
 * Enable locally with E2E_INTEGRATIONS=1 and a seeded agent that needs setup.
 */

const runIntegrations = process.env.E2E_INTEGRATIONS === "1";

test.describe("hybrid integrations UI", () => {
  test.skip(!runIntegrations, "Requires E2E_INTEGRATIONS=1 and OAuth credentials");

  test("needs_setup agent shows connection card", async ({ page }) => {
    const agentId = process.env.E2E_AGENT_ID;
    test.skip(!agentId, "Set E2E_AGENT_ID to a needs_setup agent");

    await page.goto(`/agents/${agentId}/agent`);
    await expect(
      page.getByText(/needs setup|configuration requise/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /connect|connecter/i }).first(),
    ).toBeVisible();
  });
});
