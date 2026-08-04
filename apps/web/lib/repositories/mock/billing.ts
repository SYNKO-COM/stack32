import type { Subscription } from "@/lib/domain/types";
import type { BillingRepository } from "@/lib/repositories/interfaces";

import { delay } from "./storage";

/**
 * Mock billing: simulates an active Pro subscription.
 * TODO(phase-7): real Whop integration (checkout sessions + webhooks).
 */
export class MockBillingRepository implements BillingRepository {
  async getSubscription(): Promise<Subscription | null> {
    return {
      id: "sub_mock",
      userId: "user_mock",
      provider: "whop",
      planId: "plan_pro_mock",
      planName: "Pro",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    };
  }

  async createCheckout(_planId: string): Promise<{ url: string }> {
    await delay(600);
    // Simulated checkout: jump straight to the success return page.
    return { url: "/billing/success?mock=true" };
  }
}
