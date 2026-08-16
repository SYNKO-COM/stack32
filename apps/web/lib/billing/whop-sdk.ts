import "server-only";

import Whop from "@whop/sdk";

/**
 * Server-only Whop SDK. `webhookKey` must be base64 for Standard Webhooks
 * verification (see https://docs.whop.com/developer/guides/webhooks).
 */
export function getWhopSdk(): Whop | null {
  const apiKey = process.env.WHOP_API_KEY?.trim();
  if (!apiKey) return null;

  const webhookSecret = process.env.WHOP_WEBHOOK_SECRET?.trim();
  return new Whop({
    apiKey,
    ...(webhookSecret
      ? { webhookKey: Buffer.from(webhookSecret, "utf8").toString("base64") }
      : {}),
  });
}

export function requireWhopSdk(): Whop {
  const client = getWhopSdk();
  if (!client) {
    throw new Error("WHOP_API_KEY is not configured");
  }
  return client;
}

export function getWhopCompanyId(): string | null {
  return process.env.WHOP_COMPANY_ID?.trim() || null;
}

export function requireWhopCompanyId(): string {
  const id = getWhopCompanyId();
  if (!id) throw new Error("WHOP_COMPANY_ID is not configured");
  return id;
}

export function isWhopLiveConfigured(): boolean {
  return Boolean(
    process.env.WHOP_API_KEY?.trim() &&
      process.env.WHOP_COMPANY_ID?.trim() &&
      process.env.WHOP_PRODUCT_STARTER_ID?.trim() &&
      process.env.WHOP_PRODUCT_PRO_ID?.trim() &&
      process.env.WHOP_PRODUCT_SCALE_ID?.trim(),
  );
}
