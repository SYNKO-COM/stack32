import type { Subscription } from "@/lib/domain/types";
import type { BillingRepository } from "@/lib/repositories/interfaces";
import { PLANS } from "@/lib/billing/plans";

import { delay } from "./storage";

/**
 * Mock billing for localStorage data mode. Defaults to Free; checkout
 * simulates activation via URL params only (no persistence here).
 */
export class MockBillingRepository implements BillingRepository {
  async getSubscription(): Promise<Subscription | null> {
    return {
      id: "sub_mock_free",
      userId: "user_mock",
      provider: "whop",
      planId: "free",
      planName: "Free",
      planKey: "free",
      billingInterval: "monthly",
      creditsMonthly: PLANS.free.baseCredits,
      status: "active",
    };
  }

  async createCheckout(planId: string): Promise<{ url: string }> {
    await delay(400);
    return { url: `/billing/success?mock=true&plan=${encodeURIComponent(planId)}` };
  }
}
