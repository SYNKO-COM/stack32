"use server";

import type { CreditUsage, Subscription } from "@/lib/domain/types";
import {
  clampCreditsForPlan,
  isPlanKey,
  PLANS,
  priceCreditTopUp,
  pricePlanSelection,
  type BillingInterval,
  type PlanKey,
} from "@/lib/billing/plans";
import { getSubscriptionAccess, getCurrentUser } from "@/lib/auth/guards";
import { getBillingMode } from "@/lib/env.server";
import { mapSubscription } from "@/lib/domain/mappers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildCheckoutMetadata,
  buildCreditTopUpMetadata,
  getWhopBasePlanId,
  isBaseCreditTier,
  planCheckoutTitle,
  requireWhopCreditsProductId,
  requireWhopProductId,
  whopBillingPeriodDays,
} from "@/lib/billing/whop-catalog";
import {
  isWhopLiveConfigured,
  requireWhopCompanyId,
  requireWhopSdk,
} from "@/lib/billing/whop-sdk";

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

  // Self-heal: if UI would show Free, pull Whop once so a missed webhook cannot stick.
  let access = await getSubscriptionAccess();
  const looksFree =
    !access.subscription ||
    access.subscription.plan_key === "free" ||
    access.subscription.status !== "active";
  if (looksFree) {
    try {
      const { refreshBillingStatusAction } = await import("@/lib/billing/reconcile");
      await refreshBillingStatusAction();
      access = await getSubscriptionAccess();
    } catch {
      /* keep current access */
    }
  }

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

  // Paid plans: local activation only in explicit mock mode. Production Whop
  // entitlements come exclusively from verified webhooks / reconcile.
  if (getBillingMode() !== "mock") {
    return { ok: false, error: "BILLING_REQUIRES_CHECKOUT" };
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
 * Start checkout: mock-activate when BILLING_MODE=mock; otherwise send the user
 * to /billing/checkout (Whop embed + legal consents). Never free-activates when
 * BILLING_MODE=whop, even if secrets are missing.
 */
export async function createCheckoutAction(
  planId: string,
  options?: { interval?: BillingInterval; creditsMonthly?: number },
): Promise<{ url: string; sessionId?: string; planIdWhop?: string }> {
  const [planKeyRaw, ...rest] = planId.split(":");
  const planKey = isPlanKey(planKeyRaw) ? planKeyRaw : "starter";
  const interval =
    options?.interval ??
    (rest.includes("annual") ? "annual" : "monthly");
  const creditsMonthly = clampCreditsForPlan(
    planKey,
    options?.creditsMonthly ??
      Number(rest.find((p) => /^\d+$/.test(p)) ?? PLANS[planKey].baseCredits),
  );

  if (planKey === "free") {
    const result = await activatePlanAction({
      planKey: "free",
      interval: "monthly",
      creditsMonthly: PLANS.free.baseCredits,
    });
    if (!result.ok) throw new Error(result.error);
    return { url: "/agents" };
  }

  // Free local activation only in explicit mock mode — never when BILLING_MODE=whop,
  // even if Whop secrets are incomplete (would grant paid plans without payment).
  if (getBillingMode() === "mock") {
    const result = await activatePlanAction({
      planKey,
      interval,
      creditsMonthly,
    });
    if (!result.ok) throw new Error(result.error);
    return {
      url: `/billing/success?mock=true&plan=${planKey}&credits=${creditsMonthly}&interval=${interval}`,
    };
  }

  if (!isWhopLiveConfigured()) {
    throw new Error("WHOP_NOT_CONFIGURED");
  }

  // Route through the consent + embed page with the selected plan. Session is
  // created after checkboxes so callers (upgrade dialog, etc.) never land on a
  // bare `?session=` URL the checkout page does not understand.
  const qs = new URLSearchParams({
    plan: planKey,
    interval,
    credits: String(creditsMonthly),
  });
  return {
    url: `/billing/checkout?${qs.toString()}`,
  };
}

export type WhopCheckoutSessionResult = {
  sessionId: string;
  planId: string | null;
  purchaseUrl: string | null;
  amountUsd: number;
  planKey: Exclude<PlanKey, "free">;
  interval: BillingInterval;
  creditsMonthly: number;
};

export async function createWhopCheckoutSession(input: {
  planKey: Exclude<PlanKey, "free">;
  interval: BillingInterval;
  creditsMonthly: number;
}): Promise<WhopCheckoutSessionResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!isWhopLiveConfigured()) throw new Error("WHOP_NOT_CONFIGURED");

  const creditsMonthly = clampCreditsForPlan(input.planKey, input.creditsMonthly);
  const priced = pricePlanSelection(input.planKey, input.interval, creditsMonthly);
  const productId = requireWhopProductId(input.planKey);
  const companyId = requireWhopCompanyId();
  const site =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  const metadata = buildCheckoutMetadata({
    userId: user.id,
    planKey: input.planKey,
    interval: input.interval,
    creditsMonthly,
  });

  const whop = requireWhopSdk();

  // Prefer a fixed base plan when the user picked the default credit tier.
  const basePlanId =
    isBaseCreditTier(input.planKey, creditsMonthly)
      ? getWhopBasePlanId(input.planKey, input.interval)
      : null;

  const checkout = basePlanId
    ? await whop.checkoutConfigurations.create({
        account_id: companyId,
        plan_id: basePlanId,
        metadata,
        redirect_url: `${site}/billing/success`,
      })
    : await whop.checkoutConfigurations.create({
        account_id: companyId,
        metadata,
        redirect_url: `${site}/billing/success`,
        plan: {
          account_id: companyId,
          product_id: productId,
          plan_type: "renewal",
          currency: "usd",
          billing_period: whopBillingPeriodDays(input.interval),
          // Whop charges initial_price ON TOP of the first renewal_price.
          // For a normal subscription, only renewal_price should be billed today.
          initial_price: 0,
          renewal_price: priced.chargeUsd,
          title: planCheckoutTitle(input.planKey, input.interval, creditsMonthly),
          visibility: "hidden",
          unlimited_stock: true,
          force_create_new_plan: false,
          metadata,
        },
      });

  const planId =
    typeof checkout.plan === "object" && checkout.plan && "id" in checkout.plan
      ? String((checkout.plan as { id?: string }).id ?? "")
      : null;

  const purchaseUrl =
    typeof (checkout as { purchase_url?: string }).purchase_url === "string"
      ? (checkout as { purchase_url?: string }).purchase_url!
      : null;

  return {
    sessionId: checkout.id,
    planId,
    purchaseUrl,
    amountUsd: priced.chargeUsd,
    planKey: input.planKey,
    interval: input.interval,
    creditsMonthly,
  };
}

export type WhopCreditTopUpSessionResult = {
  sessionId: string;
  purchaseUrl: string | null;
  amountUsd: number;
  credits: number;
};

/**
 * One-time credit pack checkout (Whop plan_type=one_time).
 * Does not change the user's subscription tier or credits_monthly.
 */
export async function createWhopCreditTopUpSession(input: {
  credits: number;
}): Promise<WhopCreditTopUpSessionResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const access = await getSubscriptionAccess();
  const planKey = access.subscription?.plan_key;
  if (!planKey || planKey === "free" || !["active", "trialing"].includes(access.subscription?.status ?? "")) {
    throw new Error("PAID_PLAN_REQUIRED");
  }

  const priced = priceCreditTopUp(input.credits);
  const site =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  if (getBillingMode() === "mock" || !isWhopLiveConfigured()) {
    const { grantCreditTopUpLocal } = await import("@/lib/billing/whop-fulfillment");
    await grantCreditTopUpLocal({
      userId: user.id,
      credits: priced.credits,
      amountPaidUsd: priced.chargeUsd,
    });
    return {
      sessionId: "mock",
      purchaseUrl: null,
      amountUsd: priced.chargeUsd,
      credits: priced.credits,
    };
  }

  const companyId = requireWhopCompanyId();
  const productId = requireWhopCreditsProductId();
  const metadata = buildCreditTopUpMetadata({
    userId: user.id,
    credits: priced.credits,
  });
  const whop = requireWhopSdk();

  const checkout = await whop.checkoutConfigurations.create({
    account_id: companyId,
    metadata,
    redirect_url: `${site}/billing/success?topup=1`,
    plan: {
      account_id: companyId,
      product_id: productId,
      plan_type: "one_time",
      currency: "usd",
      initial_price: priced.chargeUsd,
      title: `Credits ${priced.credits}`.slice(0, 30),
      visibility: "hidden",
      unlimited_stock: true,
      force_create_new_plan: false,
      metadata,
    },
  });

  const purchaseUrl =
    typeof (checkout as { purchase_url?: string }).purchase_url === "string"
      ? (checkout as { purchase_url?: string }).purchase_url!
      : null;

  return {
    sessionId: checkout.id,
    purchaseUrl,
    amountUsd: priced.chargeUsd,
    credits: priced.credits,
  };
}

/**
 * Cancel auto-renewal at period end. Access stays until current_period_end;
 * Whop then fires deactivated → free + agent suspension.
 */
export async function cancelSubscriptionAction(): Promise<
  { ok: true; cancelAtPeriodEnd: true } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const access = await getSubscriptionAccess();
  const sub = access.subscription;
  if (!sub || sub.plan_key === "free" || !["active", "trialing"].includes(sub.status)) {
    return { ok: false, error: "NO_ACTIVE_SUBSCRIPTION" };
  }
  const membershipId = sub.provider_membership_id?.trim();
  if (!membershipId) return { ok: false, error: "MISSING_MEMBERSHIP" };

  if (getBillingMode() === "mock" || !isWhopLiveConfigured()) {
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: false, error: "NOT_CONFIGURED" };
    const { error } = await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("provider_membership_id", membershipId);
    if (error) return { ok: false, error: "UPDATE_FAILED" };
    return { ok: true, cancelAtPeriodEnd: true };
  }

  try {
    const whop = requireWhopSdk();
    const membership = await whop.memberships.cancel(membershipId, {
      cancellation_mode: "at_period_end",
    });
    const { syncMembershipCancelFlagFromWhop } = await import(
      "@/lib/billing/whop-fulfillment"
    );
    await syncMembershipCancelFlagFromWhop({
      ...membership,
      cancel_at_period_end: true,
    });
    return { ok: true, cancelAtPeriodEnd: true };
  } catch (err) {
    console.error("[billing] cancel failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "CANCEL_FAILED" };
  }
}

/**
 * Undo a pending at-period-end cancellation (resume auto-renew).
 */
export async function resumeSubscriptionAction(): Promise<
  { ok: true; cancelAtPeriodEnd: false } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const access = await getSubscriptionAccess();
  const sub = access.subscription;
  if (!sub || sub.plan_key === "free" || !["active", "trialing"].includes(sub.status)) {
    return { ok: false, error: "NO_ACTIVE_SUBSCRIPTION" };
  }
  if (!sub.cancel_at_period_end) {
    return { ok: true, cancelAtPeriodEnd: false };
  }
  const membershipId = sub.provider_membership_id?.trim();
  if (!membershipId) return { ok: false, error: "MISSING_MEMBERSHIP" };

  if (getBillingMode() === "mock" || !isWhopLiveConfigured()) {
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: false, error: "NOT_CONFIGURED" };
    const { error } = await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: false,
        canceled_at: null,
      })
      .eq("user_id", user.id)
      .eq("provider_membership_id", membershipId);
    if (error) return { ok: false, error: "UPDATE_FAILED" };
    return { ok: true, cancelAtPeriodEnd: false };
  }

  try {
    const whop = requireWhopSdk();
    const membership = await whop.memberships.uncancel(membershipId);
    const { syncMembershipCancelFlagFromWhop } = await import(
      "@/lib/billing/whop-fulfillment"
    );
    await syncMembershipCancelFlagFromWhop({
      ...membership,
      cancel_at_period_end: false,
    });
    return { ok: true, cancelAtPeriodEnd: false };
  } catch (err) {
    console.error("[billing] resume failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "RESUME_FAILED" };
  }
}
