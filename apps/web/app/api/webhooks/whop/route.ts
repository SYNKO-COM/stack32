import { waitUntil } from "@vercel/functions";
import { NextResponse, type NextRequest } from "next/server";

import {
  deactivateMembershipFromWhop,
  fulfillMembershipFromWhop,
} from "@/lib/billing/whop-fulfillment";
import { getWhopSdk } from "@/lib/billing/whop-sdk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

type WhopEvent = { id?: string; type?: string; data?: unknown };

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function fulfillWhopEvent(
  admin: AdminClient,
  event: WhopEvent,
  providerEventId: string,
  eventType: string,
): Promise<void> {
  try {
    const isMembershipActivate =
      eventType === "membership.activated" || eventType === "membership.went_valid";
    const isMembershipDeactivate =
      eventType === "membership.deactivated" ||
      eventType === "membership.went_invalid";

    if (isMembershipActivate || eventType === "payment.succeeded") {
      const data = event.data;
      // payment.succeeded may nest membership; membership.* events are the membership
      const membership = isMembershipActivate
        ? data
        : ((data as { membership?: unknown } | null)?.membership ?? data);
      if (membership) {
        await fulfillMembershipFromWhop(membership);
      }
    }

    if (isMembershipDeactivate) {
      await deactivateMembershipFromWhop(event.data);
    }

    await admin
      .from("webhook_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("provider", "whop")
      .eq("provider_event_id", providerEventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fulfillment_failed";
    console.error("[whop webhook] fulfillment failed", message);
    await admin
      .from("webhook_events")
      .update({ status: "failed", last_error: message })
      .eq("provider", "whop")
      .eq("provider_event_id", providerEventId);
  }
}

/**
 * Whop webhooks — verify (Standard Webhooks via SDK), persist, fulfill.
 * @see https://docs.whop.com/developer/guides/webhooks
 */
export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Webhook persistence is not configured." } },
      { status: 503 },
    );
  }

  const whop = getWhopSdk();
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers);

  let event: WhopEvent;
  try {
    if (!whop || !process.env.WHOP_WEBHOOK_SECRET?.trim()) {
      return NextResponse.json(
        { error: { code: "not_configured", message: "Whop webhook secret missing." } },
        { status: 503 },
      );
    }
    event = whop.webhooks.unwrap(rawBody, { headers }) as WhopEvent;
  } catch (err) {
    console.error("[whop webhook] signature verification failed", err);
    return NextResponse.json(
      { error: { code: "invalid_signature", message: "Invalid webhook signature." } },
      { status: 401 },
    );
  }

  const providerEventId =
    (typeof event.id === "string" && event.id) || `whop_${Date.now()}`;
  const eventType = typeof event.type === "string" ? event.type : "unknown";

  const { error: persistError } = await admin.from("webhook_events").insert({
    provider: "whop",
    provider_event_id: providerEventId,
    event_type: eventType,
    payload: event as unknown as Json,
    status: "processing",
  });

  if (persistError) {
    const isDuplicate =
      persistError.code === "23505" ||
      /duplicate|unique/i.test(persistError.message);
    if (isDuplicate) {
      const { data: existing } = await admin
        .from("webhook_events")
        .select("status")
        .eq("provider", "whop")
        .eq("provider_event_id", providerEventId)
        .maybeSingle();

      // Only skip when a prior delivery already finished successfully.
      // If insert succeeded but fulfillment failed / never ran, Whop retries must
      // re-run fulfillment — otherwise paid memberships stay inactive.
      if (existing?.status === "processed") {
        return new Response("OK", { status: 200 });
      }

      await admin
        .from("webhook_events")
        .update({
          status: "processing",
          last_error: null,
          payload: event as unknown as Json,
        })
        .eq("provider", "whop")
        .eq("provider_event_id", providerEventId);

      waitUntil(fulfillWhopEvent(admin, event, providerEventId, eventType));
      return new Response("OK", { status: 200 });
    }
    // Non-duplicate DB failure: ask Whop to retry so we do not drop paid events.
    console.error("[whop webhook] persist failed", persistError.message);
    return NextResponse.json(
      { error: { code: "persist_failed", message: "Failed to persist webhook event." } },
      { status: 503 },
    );
  }

  waitUntil(fulfillWhopEvent(admin, event, providerEventId, eventType));

  return new Response("OK", { status: 200 });
}
