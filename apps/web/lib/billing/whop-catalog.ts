import type { BillingInterval, PlanKey } from "@/lib/billing/plans";
import { PLANS } from "@/lib/billing/plans";

/**
 * Whop commerce model for Stack32:
 * - 1 Whop **product** per Stack32 plan (Starter / Pro / Scale)
 * - Checkout uses an inline renewal plan attached to that product, priced from
 *   our credit tier math (so extras stay proportional without 66 static plans)
 * - Optional fixed base plan IDs for marketing / shareable links
 */

export type WhopProductKey = Exclude<PlanKey, "free">;

const PRODUCT_ENV: Record<WhopProductKey, string> = {
  starter: "WHOP_PRODUCT_STARTER_ID",
  pro: "WHOP_PRODUCT_PRO_ID",
  scale: "WHOP_PRODUCT_SCALE_ID",
};

const BASE_PLAN_ENV: Record<WhopProductKey, Record<BillingInterval, string>> = {
  starter: {
    monthly: "WHOP_PLAN_STARTER_MONTHLY_ID",
    annual: "WHOP_PLAN_STARTER_ANNUAL_ID",
  },
  pro: {
    monthly: "WHOP_PLAN_PRO_MONTHLY_ID",
    annual: "WHOP_PLAN_PRO_ANNUAL_ID",
  },
  scale: {
    monthly: "WHOP_PLAN_SCALE_MONTHLY_ID",
    annual: "WHOP_PLAN_SCALE_ANNUAL_ID",
  },
};

export function getWhopProductId(planKey: WhopProductKey): string | null {
  const envName = PRODUCT_ENV[planKey];
  return process.env[envName]?.trim() || null;
}

export function requireWhopProductId(planKey: WhopProductKey): string {
  const id = getWhopProductId(planKey);
  if (!id) {
    throw new Error(`${PRODUCT_ENV[planKey]} is not configured`);
  }
  return id;
}

/** Fixed Whop plan for the base credit tier (optional). */
export function getWhopBasePlanId(
  planKey: WhopProductKey,
  interval: BillingInterval,
): string | null {
  const envName = BASE_PLAN_ENV[planKey][interval];
  return process.env[envName]?.trim() || null;
}

export function isBaseCreditTier(
  planKey: WhopProductKey,
  creditsMonthly: number,
): boolean {
  return creditsMonthly === PLANS[planKey].baseCredits;
}

export function whopBillingPeriodDays(interval: BillingInterval): number {
  return interval === "annual" ? 365 : 30;
}

export function planCheckoutTitle(
  planKey: WhopProductKey,
  interval: BillingInterval,
  creditsMonthly: number,
): string {
  const name = planKey.charAt(0).toUpperCase() + planKey.slice(1);
  const period = interval === "annual" ? "Annual" : "Monthly";
  // Whop plan titles max ~30 chars
  const label = `${name} ${creditsMonthly}cr ${period}`;
  return label.slice(0, 30);
}

export type CheckoutMetadata = {
  stack32_user_id: string;
  plan_key: WhopProductKey;
  billing_interval: BillingInterval;
  credits_monthly: string;
  source: "stack32";
};

export function buildCheckoutMetadata(input: {
  userId: string;
  planKey: WhopProductKey;
  interval: BillingInterval;
  creditsMonthly: number;
}): CheckoutMetadata {
  return {
    stack32_user_id: input.userId,
    plan_key: input.planKey,
    billing_interval: input.interval,
    credits_monthly: String(input.creditsMonthly),
    source: "stack32",
  };
}

export function parseCheckoutMetadata(
  raw: unknown,
): Partial<CheckoutMetadata> {
  if (!raw || typeof raw !== "object") return {};
  const m = raw as Record<string, unknown>;
  return {
    stack32_user_id:
      typeof m.stack32_user_id === "string" ? m.stack32_user_id : undefined,
    plan_key:
      m.plan_key === "starter" || m.plan_key === "pro" || m.plan_key === "scale"
        ? m.plan_key
        : undefined,
    billing_interval:
      m.billing_interval === "annual" || m.billing_interval === "monthly"
        ? m.billing_interval
        : undefined,
    credits_monthly:
      typeof m.credits_monthly === "string" || typeof m.credits_monthly === "number"
        ? String(m.credits_monthly)
        : undefined,
    source: m.source === "stack32" ? "stack32" : undefined,
  };
}
