/**
 * Whop billing helpers (public-safe bits only).
 * Server checkout / webhooks live in whop-sdk + actions.
 */

export function isWhopConfigured(): boolean {
  return Boolean(
    process.env.WHOP_API_KEY &&
      process.env.WHOP_COMPANY_ID &&
      process.env.WHOP_PRODUCT_STARTER_ID &&
      process.env.WHOP_PRODUCT_PRO_ID &&
      process.env.WHOP_PRODUCT_SCALE_ID,
  );
}
