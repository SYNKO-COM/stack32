"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { readOnboardingDraft, writeOnboardingDraft, GUEST_ONBOARDING_ID } from "@/lib/onboarding-draft";
import { setPendingPrompt } from "@/lib/pending-prompt";
import { resolvePostAuthPath } from "@/lib/auth/post-auth";
import { getAuthRepository } from "@/lib/repositories/factory";

/**
 * Landing funnel: store the visitor's prompt, then start the public questions
 * (guest), send to onboarding (new user) or straight to the app
 * (returning user). After signup the flow is the same as navbar signup:
 * onboarding → plan offers. The pending prompt survives via sessionStorage
 * and initializes the first agent once they enter the builder.
 */
export function useStartFromPrompt() {
  const router = useRouter();

  return useCallback(
    async (prompt: string) => {
      setPendingPrompt(prompt);
      const auth = getAuthRepository();
      const user = await auth.getCurrentUser();
      if (!user) {
        if (prompt.trim()) writeOnboardingDraft(GUEST_ONBOARDING_ID, { ...readOnboardingDraft(GUEST_ONBOARDING_ID), step: 1, useCase: prompt.trim(), previewStartedAt: null });
        router.push("/onboarding");
        return;
      }
      router.push(await resolvePostAuthPath());
    },
    [router],
  );
}
