/**
 * Stack32 plan catalog — source of truth for pricing UI, entitlements, and
 * credit math. Whop product IDs will map onto these keys later.
 */

export const PLAN_KEYS = ["free", "starter", "pro", "scale"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];
export type BillingInterval = "monthly" | "annual";

/** Credit tiers selectable on paid plans (Lovable-style ladder). */
export const CREDIT_TIER_OPTIONS = [
  100, 200, 400, 800, 1200, 2000, 3000, 4000, 5000, 7500, 10_000,
] as const;

export const MAX_CREDITS = 10_000;

export interface PlanDefinition {
  key: PlanKey;
  /** Base monthly list price (USD). */
  monthlyPriceUsd: number;
  /** Effective monthly price when billed annually (USD). */
  annualMonthlyPriceUsd: number;
  /** Included Builder credits per month at the base tier. */
  baseCredits: number;
  /** Max platform LLM spend (USD) per month at the base credit tier. */
  baseBudgetUsd: number;
  /** Max product workspaces (null = unlimited). */
  maxWorkspaces: number | null;
  /** Max agents (null = unlimited). Free counts lifetime creations (incl. deleted). */
  maxAgents: number | null;
  /** Max Live (Agent IA) user messages (null = unlimited). */
  maxLiveMessages: number | null;
  canPublish: boolean;
  canMonetize: boolean;
  betaAccess: boolean;
  integrationsLabelKey: "integrationsLite" | "integrationsPro";
}

export const PLANS: Record<PlanKey, PlanDefinition> = {
  free: {
    key: "free",
    monthlyPriceUsd: 0,
    annualMonthlyPriceUsd: 0,
    // $1.30 covers one full first build (~$1 measured) plus a few live turns;
    // $0.20 used to stop every free user mid-build. 25 credits ≈ $0.052/credit.
    baseCredits: 25,
    baseBudgetUsd: 1.3,
    maxWorkspaces: 1,
    maxAgents: 1,
    maxLiveMessages: 10,
    canPublish: false,
    canMonetize: false,
    betaAccess: false,
    integrationsLabelKey: "integrationsLite",
  },
  starter: {
    key: "starter",
    monthlyPriceUsd: 24,
    annualMonthlyPriceUsd: 20,
    baseCredits: 100,
    baseBudgetUsd: 6,
    maxWorkspaces: 1,
    maxAgents: 5,
    maxLiveMessages: null,
    canPublish: true,
    canMonetize: false,
    betaAccess: false,
    integrationsLabelKey: "integrationsLite",
  },
  pro: {
    key: "pro",
    monthlyPriceUsd: 49,
    annualMonthlyPriceUsd: 40,
    // ~49/24 × 100, aligned to credit ladder
    baseCredits: 200,
    baseBudgetUsd: 11,
    maxWorkspaces: null,
    maxAgents: 30,
    maxLiveMessages: null,
    canPublish: true,
    canMonetize: true,
    betaAccess: true,
    integrationsLabelKey: "integrationsPro",
  },
  scale: {
    key: "scale",
    monthlyPriceUsd: 99,
    annualMonthlyPriceUsd: 80,
    // ~99/24 × 100, aligned to credit ladder
    baseCredits: 400,
    baseBudgetUsd: 21,
    maxWorkspaces: null,
    maxAgents: null,
    maxLiveMessages: null,
    canPublish: true,
    canMonetize: true,
    betaAccess: true,
    integrationsLabelKey: "integrationsPro",
  },
};

export function isPlanKey(value: string | null | undefined): value is PlanKey {
  return !!value && (PLAN_KEYS as readonly string[]).includes(value);
}

export function getPlan(key: PlanKey): PlanDefinition {
  return PLANS[key];
}

/** Credit options for a paid plan: from its base tier up to MAX_CREDITS. */
export function creditOptionsForPlan(planKey: PlanKey): number[] {
  const base = PLANS[planKey].baseCredits;
  if (planKey === "free") return [base];
  return CREDIT_TIER_OPTIONS.filter((n) => n >= base);
}

export function clampCreditsForPlan(planKey: PlanKey, credits: number): number {
  const plan = PLANS[planKey];
  if (planKey === "free") return plan.baseCredits;
  const allowed = creditOptionsForPlan(planKey);
  if (allowed.includes(credits)) return credits;
  const next = allowed.find((n) => n >= credits);
  return next ?? allowed[allowed.length - 1]!;
}

export const MAX_VARIABLE_AI_COST_RATIO = 0.25;

/** Annual effective monthly AI budget caps (>=75% margin). */
export const ANNUAL_MONTHLY_AI_BUDGET_USD: Record<Exclude<PlanKey, "free">, number> = {
  starter: 5,
  pro: 10,
  scale: 20,
};

/** One-time credit packs (top-ups) — independent of subscription tier. */
export const CREDIT_TOPUP_MIN = 50;
export const CREDIT_TOPUP_MAX = 10_000;
export const CREDIT_TOPUP_STEP = 50;
/** Sell price USD / credit (one-time packs only; subscription tiers unchanged). */
export const CREDIT_TOPUP_PRICE_USD = 0.43;
/** Platform AI budget USD / credit (unchanged — keeps ≥75% margin vs subscription economics). */
export const CREDIT_TOPUP_BUDGET_USD = 0.06;

export function clampCreditTopUp(credits: number): number {
  const raw = Number.isFinite(credits) ? credits : CREDIT_TOPUP_MIN;
  const stepped = Math.round(raw / CREDIT_TOPUP_STEP) * CREDIT_TOPUP_STEP;
  return Math.min(CREDIT_TOPUP_MAX, Math.max(CREDIT_TOPUP_MIN, stepped));
}

export function priceCreditTopUp(creditsInput: number): {
  credits: number;
  chargeUsd: number;
  budgetUsd: number;
  usdPerCreditSell: number;
  usdPerCreditCost: number;
  marginRatio: number;
} {
  const credits = clampCreditTopUp(creditsInput);
  const chargeUsd = Math.round(credits * CREDIT_TOPUP_PRICE_USD * 100) / 100;
  const budgetUsd =
    Math.round(credits * CREDIT_TOPUP_BUDGET_USD * 1_000_000) / 1_000_000;
  return {
    credits,
    chargeUsd,
    budgetUsd,
    usdPerCreditSell: CREDIT_TOPUP_PRICE_USD,
    usdPerCreditCost: CREDIT_TOPUP_BUDGET_USD,
    marginRatio: 1 - CREDIT_TOPUP_BUDGET_USD / CREDIT_TOPUP_PRICE_USD,
  };
}

/** Scale budget with selected monthly credits and billing interval. */
export function budgetUsdForCredits(
  planKey: PlanKey,
  creditsMonthly: number,
  interval: BillingInterval = "monthly",
): number {
  const plan = PLANS[planKey];
  if (planKey === "free") {
    return (plan.baseBudgetUsd * creditsMonthly) / Math.max(plan.baseCredits, 1);
  }
  const base =
    interval === "annual"
      ? ANNUAL_MONTHLY_AI_BUDGET_USD[planKey]
      : plan.baseBudgetUsd;
  const scale = creditsMonthly / Math.max(plan.baseCredits, 1);
  const scaled = base * scale;
  // Cap against *scaled* plan revenue so extra credit tiers keep proportional budget.
  const baseRevenue =
    interval === "annual" ? plan.annualMonthlyPriceUsd : plan.monthlyPriceUsd;
  const revenue = baseRevenue * scale;
  if (revenue > 0) {
    return Math.min(scaled, revenue * MAX_VARIABLE_AI_COST_RATIO);
  }
  return scaled;
}

/** @deprecated Use budgetUsdForCredits with interval for annual-aware caps. */
export function budgetUsdForCreditsLegacy(planKey: PlanKey, creditsMonthly: number): number {
  return budgetUsdForCredits(planKey, creditsMonthly, "monthly");
}

/** USD of platform cost represented by one credit at this tier. */
export function usdPerCredit(planKey: PlanKey, creditsMonthly: number): number {
  const budget = budgetUsdForCredits(planKey, creditsMonthly);
  return creditsMonthly > 0 ? budget / creditsMonthly : 0;
}

export function creditsFromCostUsd(
  costUsd: number,
  planKey: PlanKey,
  creditsMonthly: number,
): number {
  const rate = usdPerCredit(planKey, creditsMonthly);
  if (rate <= 0 || costUsd <= 0) return 0;
  return costUsd / rate;
}

export function costUsdFromCredits(
  credits: number,
  planKey: PlanKey,
  creditsMonthly: number,
): number {
  return credits * usdPerCredit(planKey, creditsMonthly);
}

export interface PricedPlanSelection {
  planKey: PlanKey;
  interval: BillingInterval;
  creditsMonthly: number;
  /** Effective monthly price shown on the card (annual = discounted monthly equiv). */
  displayMonthlyUsd: number;
  /** List monthly price before annual discount (for strikethrough). */
  listMonthlyUsd: number;
  /** Amount charged now: monthly price, or 12 × annual monthly. */
  chargeUsd: number;
  /** Platform budget for the billing period. */
  periodBudgetUsd: number;
  /** Credits available in the billing period (monthly × 1 or × 12). */
  periodCredits: number;
}

export function pricePlanSelection(
  planKey: PlanKey,
  interval: BillingInterval,
  creditsMonthlyInput: number,
): PricedPlanSelection {
  const plan = PLANS[planKey];
  const creditsMonthly = clampCreditsForPlan(planKey, creditsMonthlyInput);
  const scale = plan.baseCredits > 0 ? creditsMonthly / plan.baseCredits : 1;
  const listMonthlyUsd = plan.monthlyPriceUsd * scale;
  const annualMonthlyUsd = plan.annualMonthlyPriceUsd * scale;
  const displayMonthlyUsd = interval === "annual" ? annualMonthlyUsd : listMonthlyUsd;
  const months = interval === "annual" ? 12 : 1;
  return {
    planKey,
    interval,
    creditsMonthly,
    displayMonthlyUsd,
    listMonthlyUsd,
    chargeUsd: displayMonthlyUsd * months,
    periodBudgetUsd: budgetUsdForCredits(planKey, creditsMonthly, interval) * months,
    periodCredits: creditsMonthly * months,
  };
}

/** Fallback token rates (USD / 1M tokens) when the gateway has no response_cost. */
export const MODEL_TOKEN_RATES_USD_PER_M: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gpt-5.6-terra": { input: 2, output: 12 },
  "gpt-5.6-sol": { input: 5, output: 30 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "grok-4": { input: 3, output: 15 },
  "grok-4.5": { input: 3, output: 15 },
  whisper: { input: 0, output: 0 },
};

export function estimateCostUsdFromTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const key = Object.keys(MODEL_TOKEN_RATES_USD_PER_M).find((k) =>
    model.toLowerCase().includes(k.toLowerCase()),
  );
  const rates = key
    ? MODEL_TOKEN_RATES_USD_PER_M[key]!
    : { input: 10, output: 30 }; // conservative unknown-model fallback (fail-closed)
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
