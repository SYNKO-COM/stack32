import { redirect } from "next/navigation";

import { WhopCheckoutClient } from "@/components/billing/whop-checkout-client";
import { getCurrentUser } from "@/lib/auth/guards";
import {
  clampCreditsForPlan,
  isPlanKey,
  PLANS,
  type BillingInterval,
  type PlanKey,
} from "@/lib/billing/plans";
import { isWhopLiveConfigured } from "@/lib/billing/whop-sdk";
import { getBillingMode } from "@/lib/env.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function checkoutPath(plan: string, interval: string, credits: number): string {
  const qs = new URLSearchParams({
    plan,
    interval,
    credits: String(credits),
  });
  return `/billing/checkout?${qs.toString()}`;
}

export default async function BillingCheckoutPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const planRaw = first(params.plan) ?? "starter";
  const intervalRaw = first(params.interval) ?? "monthly";
  const creditsRaw = Number(first(params.credits) ?? "");

  if (!isPlanKey(planRaw) || planRaw === "free") {
    redirect("/pricing");
  }

  const planKey = planRaw as Exclude<PlanKey, "free">;
  const interval: BillingInterval = intervalRaw === "annual" ? "annual" : "monthly";
  const creditsMonthly = clampCreditsForPlan(
    planKey,
    Number.isFinite(creditsRaw) ? creditsRaw : PLANS[planKey].baseCredits,
  );

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(checkoutPath(planKey, interval, creditsMonthly))}`);
  }

  // Explicit mock mode only — never free-activate when BILLING_MODE=whop.
  if (getBillingMode() === "mock") {
    redirect(
      `/api/billing/mock-activate?plan=${planKey}&interval=${interval}&credits=${creditsMonthly}`,
    );
  }

  if (!isWhopLiveConfigured()) {
    redirect("/pricing?billing_error=WHOP_NOT_CONFIGURED");
  }

  // Session is created client-side only after mandatory legal consents.
  return (
    <WhopCheckoutClient
      key={`${planKey}-${interval}-${creditsMonthly}`}
      planKey={planKey}
      interval={interval}
      creditsMonthly={creditsMonthly}
    />
  );
}
