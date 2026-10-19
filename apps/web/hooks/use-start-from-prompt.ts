"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { setPendingPrompt } from "@/lib/pending-prompt";
import { useCurrentUser, useProfile } from "@/hooks/use-auth";
import { useOnboardingExperience } from "@/lib/onboarding/device";

/**
 * Landing funnel: store the visitor's prompt, then start the public questions
 * (guest), send to onboarding (new user) or straight to the app
 * (returning user). After signup the flow is the same as navbar signup:
 * onboarding → plan offers. The pending prompt survives via sessionStorage
 * and initializes the first agent once they enter the builder.
 */
export function useStartFromPrompt() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();
  const experience = useOnboardingExperience();

  return useCallback(
    (prompt: string) => {
      setPendingPrompt(prompt);
      // Public questions do not depend on another network auth request. The
      // onboarding route itself resolves identity before its save checkpoint.
      if (!user || !profile?.onboardingCompleted || experience === "mobile") {
        router.push("/onboarding");
        return;
      }
      router.push("/agents");
    },
    [router, user, profile, experience],
  );
}
