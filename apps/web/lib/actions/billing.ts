"use server";

import type { CreditUsage, Subscription } from "@/lib/domain/types";
import {
  clampCreditsForPlan,
  isPlanKey,
  PLANS,
  pricePlanSelection,
  type BillingInterval,
  type PlanKey,
} from "@/lib/billing/plans";
import { getSubscriptionAccess, getCurrentUser } from "@/lib/auth/guards";
import { getBillingMode } from "@/lib/env.server";
import { mapSubscription } from "@/lib/domain/mappers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function planDisplayName(planKey: PlanKey): string {
  return PLANS[planKey].key === "free"
    ? "Free"
    : planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

/**
 * Billing status for the UI. BILLING_MODE is server-only, so the client asks
 * through this action instead of duplicating gating logic in the browser.
 */
export async function getBillingStatusAction(): Promise<Subscription | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const access = await getSubscriptionAccess();
  if (access.subscription) {
    const mapped = mapSubscription(access.subscription);
    const planKey = isPlanKey(access.subscription.plan_key)
      ? access.subscription.plan_key
      : "free";
    return {
      ...mapped,
      planId: planKey,
      planName: planDisplayName(planKey),
      planKey,
      billingInterval: (access.subscription.billing_interval as BillingInterval) ?? "monthly",
      creditsMonthly: access.subscription.credits_monthly ?? PLANS[planKey].baseCredits,
    };
  }

  // No subscription row → Free entitlements (even in mock mode).
  return {
    id: "sub_free",
    userId: user.id,
    provider: "whop",
    planId: "free",
    planName: "Free",
    planKey: "free",
    billingInterval: "monthly",
    creditsMonthly: PLANS.free.baseCredits,
    status: "active",
  };
}

export async function getCreditUsageAction(): Promise<CreditUsage | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    // Offline / mock data mode — empty free pool.
    return {
      used: 0,
      limit: PLANS.free.baseCredits,
      remaining: PLANS.free.baseCredits,
      planKey: "free",
      billingInterval: "monthly",
      creditsMonthly: PLANS.free.baseCredits,
      exhausted: false,
    };
  }

  const { data, error } = await supabase.rpc("get_my_credit_usage");
  if (error || !data || typeof data !== "object") {
    return {
      used: 0,
      limit: PLANS.free.baseCredits,
      remaining: PLANS.free.baseCredits,
      planKey: "free",
      billingInterval: "monthly",
      creditsMonthly: PLANS.free.baseCredits,
      exhausted: false,
    };
  }

  const row = data as Record<string, unknown>;
  const used = Number(row.usedCredits ?? 0);
  const limit = Number(row.periodCredits ?? PLANS.free.baseCredits);
  const planKey = isPlanKey(String(row.planKey)) ? (String(row.planKey) as PlanKey) : "free";
  const billingInterval =
    row.billingInterval === "annual" ? "annual" : "monthly";

  return {
    used: Math.round(used * 100) / 100,
    limit,
    remaining: Math.max(0, Math.round((limit - used) * 100) / 100),
    planKey,
    billingInterval,
    creditsMonthly: Number(row.creditsMonthly ?? PLANS[planKey].baseCredits),
    usedUsd: Number(row.usedUsd ?? 0),
    budgetUsd: Number(row.budgetUsd ?? 0),
    exhausted: Boolean(row.exhausted),
    periodStart: row.periodStart ? String(row.periodStart) : undefined,
    periodEnd: row.periodEnd ? String(row.periodEnd) : undefined,
  };
}

export type ActivatePlanInput = {
  planKey: PlanKey;
  interval: BillingInterval;
  creditsMonthly: number;
};

/**
 * Persist plan selection locally (mock / pre-Whop). Real Whop checkout will
 * write the same columns from webhooks later.
 */
export async function activatePlanAction(
  input: ActivatePlanInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  if (!isPlanKey(input.planKey)) return { ok: false, error: "INVALID_PLAN" };
  if (input.interval !== "monthly" && input.interval !== "annual") {
    return { ok: false, error: "INVALID_INTERVAL" };
  }

  const creditsMonthly = clampCreditsForPlan(input.planKey, input.creditsMonthly);
  const priced = pricePlanSelection(input.planKey, input.interval, creditsMonthly);
  const now = new Date();
  const periodEnd = new Date(now);
  if (input.interval === "annual") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const service = createSupabaseAdminClient();
  if (!service) {
    // Without service role (local mock-only), still succeed for UX.
    if (getBillingMode() === "mock") return { ok: true };
    return { ok: false, error: "SERVICE_UNAVAILABLE" };
  }

  if (input.planKey === "free") {
    const { error } = await service.from("subscriptions").upsert(
      {
        user_id: user.id,
        provider: "whop",
        provider_plan_id: "plan_free",
        plan_key: "free",
        billing_interval: "monthly",
        credits_monthly: PLANS.free.baseCredits,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        raw_payload: { source: "activatePlanAction", priced } as unknown as import("@/lib/supabase/database.types").Json,
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await service.from("subscriptions").upsert(
    {
      user_id: user.id,
      provider: "whop",
      provider_plan_id: `plan_${input.planKey}_${creditsMonthly}_${input.interval}`,
      plan_key: input.planKey,
      billing_interval: input.interval,
      credits_monthly: creditsMonthly,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      raw_payload: {
        source: "activatePlanAction",
        mode: getBillingMode(),
        priced,
      } as unknown as import("@/lib/supabase/database.types").Json,
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Checkout placeholder. Mock mode activates the plan immediately then redirects.
 * Real Whop sessions land in a later phase.
 */
export async function createCheckoutAction(
  planId: string,
  options?: { interval?: BillingInterval; creditsMonthly?: number },
): Promise<{ url: string }> {
  const [planKeyRaw, ...rest] = planId.split(":");
  const planKey = isPlanKey(planKeyRaw) ? planKeyRaw : "starter";
  const interval =
    options?.interval ??
    (rest.includes("annual") ? "annual" : "monthly");
  const creditsMonthly =
    options?.creditsMonthly ??
    Number(rest.find((p) => /^\d+$/.test(p)) ?? PLANS[planKey].baseCredits);

  if (getBillingMode() === "mock") {
    const result = await activatePlanAction({
      planKey,
      interval,
      creditsMonthly: Number.isFinite(creditsMonthly)
        ? creditsMonthly
        : PLANS[planKey].baseCredits,
    });
    if (!result.ok) throw new Error(result.error);
    return {
      url: `/billing/success?mock=true&plan=${planKey}&credits=${creditsMonthly}&interval=${interval}`,
    };
  }

  // Whop not wired yet — still persist intent for logged-in users in soft mode.
  const soft = await activatePlanAction({
    planKey,
    interval,
    creditsMonthly: Number.isFinite(creditsMonthly)
      ? creditsMonthly
      : PLANS[planKey].baseCredits,
  });
  if (soft.ok) {
    return {
      url: `/billing/success?plan=${planKey}&credits=${creditsMonthly}&interval=${interval}`,
    };
  }
  throw new Error("NOT_IMPLEMENTED");
}
