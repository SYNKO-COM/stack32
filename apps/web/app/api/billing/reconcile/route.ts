import { NextResponse, type NextRequest } from "next/server";

import { reconcileFailedWhopWebhooks } from "@/lib/billing/reconcile";

export const runtime = "nodejs";

/**
 * Cron / Cloud Scheduler target: replay failed Whop webhook fulfillments.
 * Auth: Bearer CRON_SECRET or AGENT_SERVICE_INTERNAL_TOKEN.
 */
export async function POST(request: NextRequest) {
  const expected =
    process.env.CRON_SECRET?.trim() ||
    process.env.AGENT_SERVICE_INTERNAL_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Cron secret missing." } },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== expected) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid cron token." } },
      { status: 401 },
    );
  }

  const result = await reconcileFailedWhopWebhooks(25);
  console.info("[billing reconcile]", result);
  return NextResponse.json(result);
}
