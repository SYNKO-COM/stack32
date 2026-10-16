import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signQuote } from "@/lib/billing/checkout-security";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), mode: vi.fn(), configuration: vi.fn(), create: vi.fn(), retrieve: vi.fn(), quote: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/env.server", () => ({ getBillingMode: mocks.mode }));
vi.mock("@/lib/billing/whop-sdk", () => ({
  requireWhopCompanyId: () => "biz_test",
  requireWhopSdk: () => ({ checkoutConfigurations: { retrieve: mocks.configuration } }),
}));
vi.mock("@whop/sdk-elements", () => ({ WhopClient: class {
  payments = { create: mocks.create, retrieve: mocks.retrieve };
  paymentQuotes = { create: mocks.quote };
} }));
import { payCheckout, quoteCheckout, readCheckoutPayment } from "@/lib/actions/checkout-payment";

const expiry = new Date(Date.now() + 600_000).toISOString();
function input() {
  return {
    configurationId: "ch_test", confirmationToken: "ctok_test", quoteId: "pq_test", expiresAt: expiry,
    signature: signQuote({ userId: "alice", configurationId: "ch_test", quoteId: "pq_test", expiresAt: expiry }, "test-only"),
    acceptedTerms: true, acceptedImmediate: true,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("WHOP_API_KEY", "test-only");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preprod.example.invalid");
  mocks.mode.mockReturnValue("whop");
  mocks.user.mockResolvedValue({ id: "alice" });
  mocks.configuration.mockResolvedValue({ id: "ch_test", account_id: "biz_test", plan: { id: "plan_test" }, created_at: new Date().toISOString(), metadata: { stack32_user_id: "alice", kind: "subscription", source: "stack32" } });
  mocks.create.mockResolvedValue({ id: "pay_test", status: "pending", client_secret: "one-payment-secret" });
});
afterEach(() => vi.unstubAllEnvs());
describe("server payment boundary (provider mocked; no transactions)", () => {
  it("never calls Whop payments in mock mode", async () => {
    mocks.mode.mockReturnValue("mock");
    await expect(payCheckout(input())).rejects.toThrow("LIVE_PAYMENTS_DISABLED");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([{ acceptedTerms: false }, { acceptedImmediate: false }])("requires each consent server-side: %j", async (consent) => {
    await expect(payCheckout({ ...input(), ...consent })).rejects.toThrow("CONSENT_REQUIRED");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a different buyer before charging", async () => {
    mocks.user.mockResolvedValue({ id: "bob" });
    await expect(payCheckout(input())).rejects.toThrow("CHECKOUT_FORBIDDEN");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a substituted quote before charging", async () => {
    await expect(payCheckout({ ...input(), quoteId: "pq_tampered" })).rejects.toThrow("QUOTE_EXPIRED");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("retries an ambiguous network failure with the same idempotency key and trusted plan", async () => {
    mocks.create.mockRejectedValueOnce(new Error("connection lost"));
    await expect(payCheckout(input())).rejects.toThrow("PAYMENT_NOT_CONFIRMED");
    await expect(payCheckout(input())).resolves.toMatchObject({ id: "pay_test", status: "pending" });
    expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
    expect(mocks.create.mock.calls[1][0]).toMatchObject({ account_id: "biz_test", plan_id: "plan_test", quote_id: "pq_test", metadata: { consent_terms: "true", consent_immediate: "true" } });
  });
  it("does not expose another buyer's payment status", async () => {
    mocks.retrieve.mockResolvedValue({ account_id: "biz_test", metadata: { stack32_user_id: "bob" }, status: "paid" });
    await expect(readCheckoutPayment("pay_test")).rejects.toThrow("PAYMENT_FORBIDDEN");
  });
  it("does not consider a pending payment paid", async () => {
    mocks.retrieve.mockResolvedValue({ account_id: "biz_test", metadata: { stack32_user_id: "alice" }, status: "pending" });
    await expect(readCheckoutPayment("pay_test")).resolves.toEqual({ status: "pending", paid: false });
  });
  it("refuses to quote when taxes cannot be determined", async () => {
    mocks.quote.mockResolvedValue({ tax_status: "unavailable" });
    await expect(quoteCheckout({ configurationId: "ch_test", address: { country: "FR" } })).rejects.toThrow("QUOTE_UNAVAILABLE");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
