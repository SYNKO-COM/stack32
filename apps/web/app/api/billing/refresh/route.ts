import { NextResponse, type NextRequest } from "next/server";

import { refreshBillingStatusAction } from "@/lib/billing/reconcile";

export const runtime = "nodejs";

/** Authenticated client polls this after checkout until paid access is visible. */
export async function POST(_request: NextRequest) {
  const result = await refreshBillingStatusAction();
  if (!result.ok && !result.status) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Sign in required." } },
      { status: 401 },
    );
  }
  return NextResponse.json(result);
}
