import { describe, expect, it } from "vitest";

import {
  budgetUsdForCredits,
  clampCreditTopUp,
  clampCreditsForPlan,
  creditsFromCostUsd,
  priceCreditTopUp,
  pricePlanSelection,
  usdPerCredit,
} from "@/lib/billing/plans";

describe("billing plans", () => {
  it("keeps Starter base at 100 credits / $6 budget", () => {
    expect(budgetUsdForCredits("starter", 100)).toBe(6);
    expect(usdPerCredit("starter", 100)).toBeCloseTo(0.06);
  });

  it("scales Pro and Scale budgets with credit tiers", () => {
    expect(budgetUsdForCredits("pro", 200)).toBeCloseTo(11);
    expect(budgetUsdForCredits("scale", 400)).toBeCloseTo(21);
    expect(budgetUsdForCredits("starter", 200)).toBeCloseTo(12);
  });

  it("prices credit upgrades proportionally", () => {
    const starter200 = pricePlanSelection("starter", "monthly", 200);
    expect(starter200.displayMonthlyUsd).toBe(48);
    expect(starter200.periodCredits).toBe(200);

    const proAnnual = pricePlanSelection("pro", "annual", 200);
    expect(proAnnual.displayMonthlyUsd).toBe(40);
    expect(proAnnual.chargeUsd).toBe(480);
    expect(proAnnual.periodCredits).toBe(2400);
    // Annual AI budget cap $10/mo × 12 (not monthly $11)
    expect(proAnnual.periodBudgetUsd).toBeCloseTo(120);
  });

  it("prices one-time credit top-ups at $0.43 with $0.06 cost", () => {
    expect(clampCreditTopUp(73)).toBe(50);
    expect(clampCreditTopUp(75)).toBe(100);
    const pack = priceCreditTopUp(400);
    expect(pack.credits).toBe(400);
    expect(pack.chargeUsd).toBe(172);
    expect(pack.budgetUsd).toBeCloseTo(24);
    expect(pack.usdPerCreditSell).toBe(0.43);
    expect(pack.usdPerCreditCost).toBe(0.06);
    expect(pack.marginRatio).toBeCloseTo(1 - 0.06 / 0.43);
  });

  it("converts token cost into credits", () => {
    // $0.06 ≈ 1 credit on Starter 100
    expect(creditsFromCostUsd(0.06, "starter", 100)).toBeCloseTo(1);
    expect(creditsFromCostUsd(0.6, "starter", 100)).toBeCloseTo(10);
  });

  it("clamps credits to plan ladder", () => {
    expect(clampCreditsForPlan("pro", 100)).toBe(200);
    expect(clampCreditsForPlan("starter", 10_000)).toBe(10_000);
    expect(clampCreditsForPlan("free", 500)).toBe(5);
  });
});
