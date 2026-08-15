"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { setPendingPrompt } from "@/lib/pending-prompt";
import { resolvePostAuthPath } from "@/lib/auth/post-auth";
import { getAuthRepository } from "@/lib/repositories/factory";
import { useUiStore } from "@/store/ui-store";

/**
 * Landing funnel: store the visitor's prompt, then either open the auth
 * modal (guest), send to onboarding (new user) or straight to the app
 * (returning user). The pending prompt survives the whole funnel via
 * sessionStorage and initializes the first agent build.
 */
export function useStartFromPrompt() {
  const router = useRouter();
  const openDialog = useUiStore((s) => s.openDialog);

  return useCallback(
    async (prompt: string) => {
      setPendingPrompt(prompt);
      const auth = getAuthRepository();
      const user = await auth.getCurrentUser();
      if (!user) {
        openDialog("auth", { authMode: "signup" });
        return;
      }
      router.push(await resolvePostAuthPath());
    },
    [openDialog, router],
  );
}
