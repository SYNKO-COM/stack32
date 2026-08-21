import { describe, expect, it } from "vitest";

import {
  isWhopActivateEvent,
  isWhopCancelAtPeriodEndChanged,
  isWhopDeactivateEvent,
  isWhopPaymentFailed,
  isWhopPaymentSucceeded,
  isWhopRefundCreated,
  whopEventKey,
} from "@/lib/billing/whop-event-types";

describe("whop-event-types", () => {
  it("normalizes underscore and dotted event names", () => {
    expect(whopEventKey("membership_went_valid")).toBe("membershipwentvalid");
    expect(whopEventKey("membership.went_valid")).toBe("membershipwentvalid");
    expect(whopEventKey("payment.succeeded")).toBe("paymentsucceeded");
    expect(whopEventKey("payment_succeeded")).toBe("paymentsucceeded");
  });

  it("matches activate / deactivate / payment / refund variants", () => {
    expect(isWhopActivateEvent("membership_went_valid")).toBe(true);
    expect(isWhopActivateEvent("membership.activated")).toBe(true);
    expect(isWhopDeactivateEvent("membership_went_invalid")).toBe(true);
    expect(isWhopDeactivateEvent("membership.deactivated")).toBe(true);
    expect(isWhopPaymentSucceeded("payment.succeeded")).toBe(true);
    expect(isWhopPaymentFailed("payment.failed")).toBe(true);
    expect(isWhopRefundCreated("refund.created")).toBe(true);
    expect(isWhopCancelAtPeriodEndChanged("membership.cancel_at_period_end_changed")).toBe(
      true,
    );
    expect(isWhopActivateEvent("payment.failed")).toBe(false);
  });
});
