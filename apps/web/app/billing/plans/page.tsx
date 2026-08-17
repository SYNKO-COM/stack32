import { OnboardingPlans } from "@/components/billing/onboarding-plans";
import { requireCompletedOnboarding } from "@/lib/auth/guards";

export default async function BillingPlansPage() {
  await requireCompletedOnboarding();
  return <OnboardingPlans />;
}
