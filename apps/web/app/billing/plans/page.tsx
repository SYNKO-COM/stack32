import { OnboardingPlans } from "@/components/billing/onboarding-plans";
import { requireCompletedOnboarding } from "@/lib/auth/guards";
import { getMobileProject } from "@/lib/actions/mobile-onboarding";

export default async function BillingPlansPage() {
  await requireCompletedOnboarding();
  const { project } = await getMobileProject();
  return <OnboardingPlans mobileProject={Boolean(project && project.status !== "launched")} />;
}
