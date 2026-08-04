import type { Subscription } from "@/lib/domain/types";
import { createCheckoutAction, getBillingStatusAction } from "@/lib/actions/billing";
import type { BillingRepository } from "@/lib/repositories/interfaces";

/**
 * Billing repository backed by the server-side billing actions (subscription
 * rows are server-managed; BILLING_MODE gating lives on the server).
 */
export class SupabaseBillingRepository implements BillingRepository {
  async getSubscription(): Promise<Subscription | null> {
    return getBillingStatusAction();
  }

  async createCheckout(planId: string): Promise<{ url: string }> {
    return createCheckoutAction(planId);
  }
}
