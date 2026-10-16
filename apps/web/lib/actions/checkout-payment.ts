"use server";

import { createHash } from "node:crypto";
import { WhopClient } from "@whop/sdk-elements";
import { z } from "zod";
import { getBillingMode } from "@/lib/env.server";
import { getCurrentUser } from "@/lib/auth/guards";
import { requireWhopCompanyId, requireWhopSdk } from "@/lib/billing/whop-sdk";
import { assertCheckoutConsents, assertCheckoutOwner, signQuote, verifyQuote } from "@/lib/billing/checkout-security";

const addressSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  name: z.string().max(200).optional(),
  line1: z.string().max(300).optional(), line2: z.string().max(300).optional(),
  city: z.string().max(100).optional(), state: z.string().max(100).optional(), postal_code: z.string().max(30).optional(),
});
const configurationSchema = z.string().regex(/^ch_[a-zA-Z0-9]+$/);
function client() {
  const token = process.env.WHOP_API_KEY?.trim();
  if (!token) throw new Error("WHOP_NOT_CONFIGURED");
  // The new official SDK supports confirmation tokens; the existing SDK keeps
  // handling historical memberships/webhooks until a separate migration.
  return new WhopClient({ token, timeoutInSeconds: 20, maxRetries: 1 });
}
async function ownedCheckout(configurationId: string) {
  configurationSchema.parse(configurationId);
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  const configuration = await requireWhopSdk().checkoutConfigurations.retrieve(configurationId);
  assertCheckoutOwner(configuration, user.id, requireWhopCompanyId());
  if (!configuration.plan?.id) throw new Error("CHECKOUT_INVALID");
  return { user, configuration, planId: configuration.plan.id };
}
function returnUrl() {
  const site = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) throw new Error("APP_URL_REQUIRED");
  const url = new URL("/billing/success", site);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("APP_URL_INVALID");
  return url.href;
}

export async function quoteCheckout(input: { configurationId: string; address: z.infer<typeof addressSchema>; promoCode?: string }) {
  const address = addressSchema.parse(input.address);
  const promoCode = z.string().max(100).optional().parse(input.promoCode);
  const { user, configuration, planId } = await ownedCheckout(input.configurationId);
  try {
    const quote = await client().paymentQuotes.create({ account_id: configuration.account_id, plan_id: planId, address, ...(promoCode?.trim() ? { promo_code: promoCode.trim() } : {}) });
    if (quote.tax_status === "unavailable") throw new Error("QUOTE_UNAVAILABLE");
    const authorization = { userId: user.id, configurationId: configuration.id, quoteId: quote.id, expiresAt: quote.expires_at };
    return { quoteId: quote.id, expiresAt: quote.expires_at, signature: signQuote(authorization, process.env.WHOP_API_KEY!), total: quote.total.amount, currency: quote.currency };
  } catch {
    // Do not return provider payloads (addresses, tokens, or account details).
    throw new Error("QUOTE_UNAVAILABLE");
  }
}

export async function payCheckout(input: {
  configurationId: string; confirmationToken: string; quoteId: string; expiresAt: string; signature: string;
  acceptedTerms: boolean; acceptedImmediate: boolean;
}) {
  if (getBillingMode() !== "whop") throw new Error("LIVE_PAYMENTS_DISABLED");
  assertCheckoutConsents(input.acceptedTerms, input.acceptedImmediate);
  z.string().regex(/^ctok_[a-zA-Z0-9]+$/).parse(input.confirmationToken);
  z.string().regex(/^pq_[a-zA-Z0-9]+$/).parse(input.quoteId);
  const { user, configuration, planId } = await ownedCheckout(input.configurationId);
  const authorization = { userId: user.id, configurationId: configuration.id, quoteId: input.quoteId, expiresAt: input.expiresAt };
  if (!verifyQuote(authorization, input.signature, process.env.WHOP_API_KEY!)) throw new Error("QUOTE_EXPIRED");
  const metadata = Object.fromEntries(Object.entries(configuration.metadata as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const key = createHash("sha256").update(`stack32:${user.id}:${input.quoteId}`).digest("hex");
  try {
    const payment = await client().payments.create({
      account_id: configuration.account_id, plan_id: planId, quote_id: input.quoteId,
      confirmation_token: input.confirmationToken, return_url: returnUrl(),
      metadata: { ...metadata, consent_terms: "true", consent_immediate: "true", consent_version: "2026-10-16", consent_quote: input.quoteId },
    }, { idempotencyKey: key });
    return { id: payment.id, status: payment.status, clientSecret: payment.client_secret };
  } catch {
    throw new Error("PAYMENT_NOT_CONFIRMED");
  }
}

export async function readCheckoutPayment(paymentId: string) {
  z.string().regex(/^pay_[a-zA-Z0-9]+$/).parse(paymentId);
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  const payment = await client().payments.retrieve({ id: paymentId });
  if (payment.account_id !== requireWhopCompanyId() || payment.metadata?.stack32_user_id !== user.id) throw new Error("PAYMENT_FORBIDDEN");
  return { paid: payment.status === "paid", status: payment.status };
}
