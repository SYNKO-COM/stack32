import { NextResponse, type NextRequest } from "next/server";

import { activatePlanAction } from "@/lib/actions/billing";
import {
  clampCreditsForPlan,
  isPlanKey,
  PLANS,
  type BillingInterval,
} from "@/lib/billing/plans";
import { getBillingMode } from "@/lib/env.server";

/**
 * Dev/preview helper when BILLING_MODE=mock.
 * Disabled when BILLING_MODE=whop (never free-activates in production mode).
 */
export async function GET(request: NextRequest) {
  if (getBillingMode() === "whop") {
    return NextResponse.redirect(new URL("/pricing", request.url));
  }

  const planRaw = request.nextUrl.searchParams.get("plan") ?? "starter";
  const intervalRaw = request.nextUrl.searchParams.get("interval") ?? "monthly";
  const creditsRaw = Number(request.nextUrl.searchParams.get("credits") ?? "");

  if (!isPlanKey(planRaw) || planRaw === "free") {
    return NextResponse.redirect(new URL("/pricing", request.url));
  }

  const interval: BillingInterval = intervalRaw === "annual" ? "annual" : "monthly";
  const creditsMonthly = clampCreditsForPlan(
    planRaw,
    Number.isFinite(creditsRaw) ? creditsRaw : PLANS[planRaw].baseCredits,
  );

  const result = await activatePlanAction({
    planKey: planRaw,
    interval,
    creditsMonthly,
  });

  if (!result.ok) {
    const loginNext = encodeURIComponent(
      `/billing/checkout?plan=${planRaw}&interval=${interval}&credits=${creditsMonthly}`,
    );
    if (result.error === "UNAUTHENTICATED") {
      return NextResponse.redirect(new URL(`/login?next=${loginNext}`, request.url));
    }
    return NextResponse.redirect(
      new URL(`/pricing?billing_error=${encodeURIComponent(result.error)}`, request.url),
    );
  }

  return NextResponse.redirect(
    new URL(
      `/billing/success?mock=true&plan=${planRaw}&credits=${creditsMonthly}&interval=${interval}`,
      request.url,
    ),
  );
}
