/**
 * Whop billing scaffold (Phase 1).
 *
 * No real Whop API calls are made yet. Integration points are marked with
 * TODO(phase-7) and must follow the official Whop API documentation —
 * do NOT invent endpoint contracts or webhook signature schemes.
 */

export const WHOP_PLAN_ID = process.env.NEXT_PUBLIC_WHOP_PLAN_ID ?? "plan_pro_mock";

/** TODO(phase-7): create a real Whop checkout session server-side (WHOP_API_KEY). */
export function isWhopConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_WHOP_PLAN_ID);
}
