import "server-only";

import {
  clampCreditsForPlan,
  PLANS,
  type BillingInterval,
  type PlanKey,
} from "@/lib/billing/plans";
import { parseCheckoutMetadata } from "@/lib/billing/whop-catalog";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickIsoDate(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return v;
    if (typeof v === "number" && Number.isFinite(v)) {
      return new Date(v * (v < 1e12 ? 1000 : 1)).toISOString();
    }
  }
  return null;
}

export async function fulfillMembershipFromWhop(payload: unknown): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin client unavailable");

  const data = asRecord(payload);
  const metadata = parseCheckoutMetadata(
    data.metadata ?? asRecord(data.checkout_configuration).metadata ?? data.meta,
  );

  const membershipId =
    pickString(data.id, data.membership_id, asRecord(data.membership).id) ??
    `unknown_${Date.now()}`;

  const userId = metadata.stack32_user_id;
  if (!userId || !metadata.plan_key) {
    // Cannot map to Stack32 user/plan — store nothing entitling.
    console.warn("[whop] membership missing stack32 metadata", {
      membershipId,
      metadata,
    });
    return;
  }

  const planKey = metadata.plan_key;
  const interval: BillingInterval =
    metadata.billing_interval === "annual" ? "annual" : "monthly";
  const creditsMonthly = clampCreditsForPlan(
    planKey,
    Number(metadata.credits_monthly ?? PLANS[planKey].baseCredits),
  );

  const periodStart =
    pickIsoDate(
      data.renewal_period_start,
      data.current_period_start,
      data.valid_from,
      data.created_at,
    ) ?? new Date().toISOString();

  const periodEnd = pickIsoDate(
    data.renewal_period_end,
    data.current_period_end,
    data.expires_at,
    data.valid_until,
  );

  const member = asRecord(data.member);
  const customerId = pickString(member.id, data.member_id, data.user_id);

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      provider: "whop",
      provider_customer_id: customerId,
      provider_membership_id: membershipId,
      provider_plan_id: pickString(
        asRecord(data.plan).id,
        data.plan_id,
        `plan_${planKey}_${creditsMonthly}_${interval}`,
      ),
      plan_key: planKey,
      billing_interval: interval,
      credits_monthly: creditsMonthly,
      status: "active",
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: Boolean(data.cancel_at_period_end),
      raw_payload: data as Json,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export async function deactivateMembershipFromWhop(payload: unknown): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin client unavailable");

  const data = asRecord(payload);
  const metadata = parseCheckoutMetadata(data.metadata);
  const membershipId = pickString(data.id, data.membership_id);
  const userId = metadata.stack32_user_id;

  if (userId) {
    await admin
      .from("subscriptions")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        raw_payload: data as Json,
      })
      .eq("user_id", userId);
    return;
  }

  if (membershipId) {
    await admin
      .from("subscriptions")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        raw_payload: data as Json,
      })
      .eq("provider_membership_id", membershipId);
  }
}
