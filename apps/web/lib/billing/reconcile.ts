import "server-only";

import { getCurrentUser } from "@/lib/auth/guards";
import { fulfillMembershipFromWhop } from "@/lib/billing/whop-fulfillment";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * After checkout, poll the caller's subscription row (webhook remains canonical).
 */
export async function refreshBillingStatusAction(): Promise<{
  ok: boolean;
  planKey: string | null;
  status: string | null;
  paid: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, planKey: null, status: null, paid: false };

  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, planKey: null, status: null, paid: false };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_key, status, provider_membership_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const paid =
    sub?.status === "active" && Boolean(sub.plan_key) && sub.plan_key !== "free";

  return {
    ok: true,
    planKey: sub?.plan_key ?? "free",
    status: sub?.status ?? "inactive",
    paid,
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
