import { NextResponse, type NextRequest } from "next/server";

import { reconcileFailedWhopWebhooks } from "@/lib/billing/reconcile";

export const runtime = "nodejs";

function authorize(request: NextRequest): NextResponse | null {
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
  // Vercel Cron sends Authorization: Bearer $CRON_SECRET when the env is set.
  if (token !== expected) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid cron token." } },
      { status: 401 },
    );
  }
  return null;
}

/**
 * Cron / Cloud Scheduler target: replay failed Whop webhook fulfillments.
 * Vercel Cron uses GET; Cloud Scheduler / manual callers may use POST.
 */
async function handle(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;

  const result = await reconcileFailedWhopWebhooks(25);
  console.info("[billing reconcile]", result);
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
