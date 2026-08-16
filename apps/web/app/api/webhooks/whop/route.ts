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

  let event: { id?: string; type?: string; data?: unknown };
  try {
    if (!whop || !process.env.WHOP_WEBHOOK_SECRET?.trim()) {
      return NextResponse.json(
        { error: { code: "not_configured", message: "Whop webhook secret missing." } },
        { status: 503 },
      );
    }
    event = whop.webhooks.unwrap(rawBody, { headers }) as {
      id?: string;
      type?: string;
      data?: unknown;
    };
  } catch (err) {
    console.error("[whop webhook] signature verification failed", err);
    return NextResponse.json(
      { error: { code: "invalid_signature", message: "Invalid webhook signature." } },
      { status: 401 },
    );
  }

  const providerEventId =
    (typeof event.id === "string" && event.id) ||
    `whop_${Date.now()}`;
  const eventType = typeof event.type === "string" ? event.type : "unknown";

  const { error: persistError } = await admin.from("webhook_events").upsert(
    {
      provider: "whop",
      provider_event_id: providerEventId,
      event_type: eventType,
      payload: event as unknown as Json,
      status: "processing",
    },
    { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
  );

  if (persistError) {
    // Likely duplicate — still return 200 so Whop does not retry forever.
    console.warn("[whop webhook] persist", persistError.message);
    return new Response("OK", { status: 200 });
  }

  waitUntil(
    (async () => {
      try {
        const isMembershipActivate =
          eventType === "membership.activated" ||
          eventType === "membership.went_valid";
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
    })(),
  );

  return new Response("OK", { status: 200 });
}
