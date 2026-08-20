import "server-only";

import { getCurrentUser } from "@/lib/auth/guards";
import { parseCheckoutMetadata } from "@/lib/billing/whop-catalog";
import { fulfillMembershipFromWhop } from "@/lib/billing/whop-fulfillment";
import { getWhopCompanyId, getWhopSdk } from "@/lib/billing/whop-sdk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function readPaidStatus(userId: string): Promise<{
  planKey: string | null;
  status: string | null;
  paid: boolean;
}> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { planKey: null, status: null, paid: false };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_key, status, provider_membership_id")
    .eq("user_id", userId)
    .maybeSingle();

  const paid =
    sub?.status === "active" && Boolean(sub.plan_key) && sub.plan_key !== "free";

  return {
    planKey: sub?.plan_key ?? "free",
    status: sub?.status ?? "inactive",
    paid,
  };
}

/**
 * Don't wait solely on the webhook: pull recent Whop memberships and fulfill
 * the one tagged with this Stack32 user.
 */
async function pullWhopMembershipForUser(userId: string): Promise<void> {
  const whop = getWhopSdk();
  const companyId = getWhopCompanyId();
  if (!whop || !companyId) return;

  const createdAfter = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  try {
    const page = await whop.memberships.list({
      company_id: companyId,
      created_after: createdAfter,
      statuses: ["active", "completed", "trialing"],
      first: 25,
      order: "created_at",
      direction: "desc",
    });

    for await (const membership of page) {
      const meta = parseCheckoutMetadata(membership.metadata);
      if (meta.stack32_user_id !== userId) continue;
      await fulfillMembershipFromWhop(membership);
      return;
    }
  } catch (err) {
    console.warn(
      "[billing] whop membership pull failed",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * After checkout, poll the caller's subscription row (webhook remains canonical).
 * Also proactively pulls Whop when not yet marked paid so activation is faster.
 */
export async function refreshBillingStatusAction(): Promise<{
  ok: boolean;
  planKey: string | null;
  status: string | null;
  paid: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, planKey: null, status: null, paid: false };

  let current = await readPaidStatus(user.id);
  if (!current.paid) {
    await pullWhopMembershipForUser(user.id);
    current = await readPaidStatus(user.id);
  }

  return {
    ok: true,
    planKey: current.planKey,
    status: current.status,
    paid: current.paid,
  };
}

/**
 * Replay failed / stuck Whop webhook events (cron / internal).
 */
export async function reconcileFailedWhopWebhooks(limit = 20): Promise<{
  replayed: number;
  errors: number;
}> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { replayed: 0, errors: 0 };

  const { data: rows } = await admin
    .from("webhook_events")
    .select("provider_event_id, event_type, payload, status, updated_at")
    .eq("provider", "whop")
    .in("status", ["failed", "processing"])
    .order("updated_at", { ascending: true })
    .limit(limit);

  let replayed = 0;
  let errors = 0;

  for (const row of rows ?? []) {
    const { data: claimed } = await admin.rpc("claim_webhook_event", {
      p_provider: "whop",
      p_provider_event_id: row.provider_event_id,
    });
    if (!claimed) continue;

    try {
      const payload = row.payload as { data?: unknown; type?: string };
      const eventType = row.event_type || payload?.type || "unknown";
      const data = payload?.data ?? payload;

      if (
        eventType === "membership.activated" ||
        eventType === "membership.went_valid" ||
        eventType === "payment.succeeded"
      ) {
        const membership =
          eventType === "payment.succeeded"
            ? ((data as { membership?: unknown } | null)?.membership ?? data)
            : data;
        if (membership) await fulfillMembershipFromWhop(membership);
      }

      await admin
        .from("webhook_events")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("provider", "whop")
        .eq("provider_event_id", row.provider_event_id);
      replayed += 1;
    } catch (err) {
      errors += 1;
      await admin
        .from("webhook_events")
        .update({
          status: "failed",
          last_error: err instanceof Error ? err.message : "reconcile_failed",
        })
        .eq("provider", "whop")
        .eq("provider_event_id", row.provider_event_id);
    }
  }

  return { replayed, errors };
}
