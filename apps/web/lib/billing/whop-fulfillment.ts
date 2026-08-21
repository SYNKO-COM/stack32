import "server-only";

import {
  clampCreditsForPlan,
  PLANS,
  type BillingInterval,
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

async function restoreAgentsAfterBilling(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin.rpc("restore_agents_after_billing", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[whop] restore_agents_after_billing", error.message);
  }
}

async function suspendAgentsForBilling(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin.rpc("suspend_agents_for_billing", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[whop] suspend_agents_for_billing", error.message);
  }
}

export async function fulfillMembershipFromWhop(payload: unknown): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin client unavailable");

  const data = asRecord(payload);
  const metadata = parseCheckoutMetadata(
    data.metadata ?? asRecord(data.checkout_configuration).metadata ?? data.meta,
  );

  const membershipId = pickString(
    data.id,
    data.membership_id,
    asRecord(data.membership).id,
  );
  if (!membershipId) {
    throw new Error("whop_membership_id_missing");
  }

  const userId = metadata.stack32_user_id;
  if (!userId || !metadata.plan_key) {
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
      canceled_at: null,
      raw_payload: data as Json,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;

  await restoreAgentsAfterBilling(userId);
}

export async function deactivateMembershipFromWhop(payload: unknown): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin client unavailable");

  const data = asRecord(payload);
  const membershipId = pickString(data.id, data.membership_id, asRecord(data.membership).id);

  if (!membershipId) {
    console.warn("[whop] deactivation missing membership id", {
      metadata: parseCheckoutMetadata(data.metadata),
    });
    return;
  }

  const { data: sub, error: findError } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("provider", "whop")
    .eq("provider_membership_id", membershipId)
    .maybeSingle();
  if (findError) throw findError;

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "canceled",
      plan_key: "free",
      credits_monthly: PLANS.free.baseCredits,
      cancel_at_period_end: false,
      canceled_at: new Date().toISOString(),
      raw_payload: data as Json,
    })
    .eq("provider", "whop")
    .eq("provider_membership_id", membershipId);

  if (error) throw error;

  if (sub?.user_id) {
    await suspendAgentsForBilling(sub.user_id);
  }
}

/**
 * Sync cancel_at_period_end without revoking access (user paid through period end).
 */
export async function syncMembershipCancelFlagFromWhop(payload: unknown): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin client unavailable");

  const data = asRecord(payload);
  const membershipId = pickString(data.id, data.membership_id, asRecord(data.membership).id);
  if (!membershipId) return;

  const cancelAtPeriodEnd = Boolean(data.cancel_at_period_end);
  const { error } = await admin
    .from("subscriptions")
    .update({
      cancel_at_period_end: cancelAtPeriodEnd,
      canceled_at: cancelAtPeriodEnd
        ? pickIsoDate(data.canceled_at) ?? new Date().toISOString()
        : null,
      raw_payload: data as Json,
    })
    .eq("provider", "whop")
    .eq("provider_membership_id", membershipId)
    .in("status", ["active", "trialing", "past_due"]);

  if (error) throw error;
}

/**
 * Mark subscription past_due without suspending yet (Whop may still retry).
 * Suspension happens only on membership went_invalid / deactivated.
 */
export async function markMembershipPastDueFromWhop(payload: unknown): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin client unavailable");

  const data = asRecord(payload);
  const membershipId = pickString(
    data.membership_id,
    asRecord(data.membership).id,
    data.id,
  );
  if (!membershipId) return;

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "past_due",
      raw_payload: data as Json,
    })
    .eq("provider", "whop")
    .eq("provider_membership_id", membershipId)
    .eq("status", "active");

  if (error) throw error;
}
