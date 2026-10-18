import { describe, expect, it } from "vitest";
import { assertCheckoutConsents, assertCheckoutOwner, signQuote, verifyQuote } from "@/lib/billing/checkout-security";
const now = Date.parse("2026-10-16T12:00:00Z");
const quote = { userId: "alice", configurationId: "ch_one", quoteId: "pq_one", expiresAt: "2026-10-16T12:10:00Z" };
describe("checkout authorization", () => {
  it.each([[false,false],[true,false],[false,true],["true",true],[true,null]])("requires both explicit booleans (%s, %s)", (a,b) => { expect(() => assertCheckoutConsents(a,b)).toThrow("CONSENT_REQUIRED"); });
  it("accepts both consents", () => expect(() => assertCheckoutConsents(true,true)).not.toThrow());
  it("binds a quote to its account, checkout, price and expiry", () => {
    const signature = signQuote(quote, "test-secret");
    expect(verifyQuote(quote, signature, "test-secret", now)).toBe(true);
    for (const change of [{userId:"bob"},{configurationId:"ch_two"},{quoteId:"pq_two"},{expiresAt:"2027-01-01"}]) expect(verifyQuote({...quote,...change},signature,"test-secret",now)).toBe(false);
    expect(verifyQuote(quote,signature,"other-secret",now)).toBe(false);
    expect(verifyQuote(quote,signature,"test-secret",now+600000)).toBe(false);
    expect(verifyQuote(quote,"malformed","test-secret",now)).toBe(false);
  });
  const config = {account_id:"biz_test",created_at:new Date(now).toISOString(),metadata:{stack32_user_id:"alice",source:"stack32",kind:"subscription"}};
  it("isolates buyers and merchant accounts", () => {
    expect(() => assertCheckoutOwner(config,"alice","biz_test",now)).not.toThrow();
    expect(() => assertCheckoutOwner(config,"bob","biz_test",now)).toThrow();
    expect(() => assertCheckoutOwner(config,"alice","biz_other",now)).toThrow();
    expect(() => assertCheckoutOwner({...config,metadata:{}},"alice","biz_test",now)).toThrow();
  });
  it("rejects expired or malformed configurations", () => {
    expect(() => assertCheckoutOwner(config,"alice","biz_test",now+1800001)).toThrow("CHECKOUT_EXPIRED");
    expect(() => assertCheckoutOwner({...config,created_at:"bad"},"alice","biz_test",now)).toThrow();
  });
});
