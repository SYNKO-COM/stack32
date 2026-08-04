"use server";

import type { Subscription } from "@/lib/domain/types";
import { getSubscriptionAccess } from "@/lib/auth/guards";
import { getBillingMode } from "@/lib/env.server";
import { getCurrentUser } from "@/lib/auth/guards";
import { mapSubscription } from "@/lib/domain/mappers";

/**
 * Billing status for the UI. BILLING_MODE is server-only, so the client asks
 * through this action instead of duplicating gating logic in the browser.
 */
export async function getBillingStatusAction(): Promise<Subscription | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const access = await getSubscriptionAccess();
  if (access.subscription) return mapSubscription(access.subscription);

  if (access.mode === "mock") {
    // Development-only simulated subscription, clearly labeled as mocked.
    return {
      id: "sub_mock",
      userId: user.id,
      provider: "whop",
      planId: "plan_pro_mock",
      planName: "Pro",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    };
  }

  return null;
}

/**
 * Checkout placeholder. Real Whop checkout sessions land in Phase 7 — no Whop
 * API formats are fabricated here.
 */
export async function createCheckoutAction(_planId: string): Promise<{ url: string }> {
  if (getBillingMode() === "mock") {
    return { url: "/billing/success?mock=true" };
  }
  throw new Error("NOT_IMPLEMENTED");
}
