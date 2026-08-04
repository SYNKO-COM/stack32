import { NextResponse, type NextRequest } from "next/server";

/**
 * Whop webhook endpoint placeholder.
 *
 * TODO(phase-7):
 * 1. Verify the webhook signature using WHOP_WEBHOOK_SECRET, following the
 *    official Whop documentation (do not invent a signature scheme).
 * 2. Store the raw event in the `webhook_events` table (idempotent on
 *    provider + event_id) using the server-side Supabase admin client.
 * 3. Sync the `subscriptions` table from membership events.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: { code: "not_implemented", message: "Whop webhooks are scaffolded in Phase 1." } },
    { status: 501 },
  );
}
