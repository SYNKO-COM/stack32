import { createHmac, timingSafeEqual } from "node:crypto";

export type QuoteAuthorization = { userId: string; configurationId: string; quoteId: string; expiresAt: string };
export function signQuote(value: QuoteAuthorization, secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(value)).digest("hex");
}
export function verifyQuote(value: QuoteAuthorization, signature: string, secret: string, now = Date.now()): boolean {
  if (!/^[a-f0-9]{64}$/.test(signature) || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signQuote(value, secret), "hex"));
}
export function assertCheckoutOwner(configuration: { account_id: string; metadata?: unknown; created_at: string }, userId: string, accountId: string, now = Date.now()) {
  const metadata = configuration.metadata as Record<string, unknown> | null;
  const created = Date.parse(configuration.created_at);
  if (configuration.account_id !== accountId || metadata?.stack32_user_id !== userId || metadata?.source !== "stack32" || metadata?.kind !== "subscription") throw new Error("CHECKOUT_FORBIDDEN");
  if (!Number.isFinite(created) || now - created > 30 * 60_000 || created > now + 60_000) throw new Error("CHECKOUT_EXPIRED");
}
export function assertCheckoutConsents(terms: unknown, immediate: unknown) {
  if (terms !== true || immediate !== true) throw new Error("CONSENT_REQUIRED");
}
