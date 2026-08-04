import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Whop webhook endpoint — Phase 2 scaffold.
 *
 * Events are persisted idempotently in the server-only `webhook_events`
 * table so nothing is lost before the real integration lands.
 *
 * TODO(phase-7):
 * 1. Verify the webhook signature using WHOP_WEBHOOK_SECRET, following the
 *    official Whop documentation (do not invent a signature scheme).
 * 2. Process pending events and sync the `subscriptions` table from
 *    membership events.
 *
 * Until signature verification exists, events are stored with status
 * "skipped" and never processed, so unverified payloads can't affect
 * subscriptions.
 */
export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Webhook persistence is not configured." } },
      { status: 503 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_payload", message: "Body must be JSON." } },
      { status: 400 },
    );
  }

  const providerEventId =
    (typeof payload.id === "string" && payload.id) ||
    (typeof payload.event_id === "string" && payload.event_id) ||
    null;
  const eventType =
    (typeof payload.event === "string" && payload.event) ||
    (typeof payload.type === "string" && payload.type) ||
    "unknown";

  if (!providerEventId) {
    return NextResponse.json(
      { error: { code: "missing_event_id", message: "Event id is required." } },
      { status: 400 },
    );
  }

  // Idempotent persistence: replayed events are ignored.
  const { error } = await admin.from("webhook_events").upsert(
    {
      provider: "whop",
      provider_event_id: providerEventId,
      event_type: eventType,
      payload: payload as Json,
      status: "skipped",
      last_error: "Signature verification not implemented (Phase 7); event stored, not processed.",
    },
    { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
  );

  if (error) {
    return NextResponse.json(
      { error: { code: "persistence_failed", message: "Could not store the event." } },
      { status: 500 },
    );
  }

  // 200 so the provider does not retry forever; processing happens in Phase 7.
  return NextResponse.json({ received: true, processed: false });
}
