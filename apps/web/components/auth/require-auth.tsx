"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCurrentUser, useProfile } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";

/**
 * Client-side gate for authenticated, onboarding-complete routes.
 * Middleware already blocks anonymous users; this prevents private flash
 * and redirects incomplete profiles to /onboarding.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { data: user, isLoading: userLoading, isError: userError } = useCurrentUser();
  const { data: profile, isLoading: profileLoading } = useProfile();

  const settling = userLoading || profileLoading;

  useEffect(() => {
    if (settling) return;
    if (userError || !user) {
      router.replace("/login");
      return;
    }
    if (!profile || !profile.onboardingCompleted) {
      router.replace("/onboarding");
    }
  }, [user, profile, settling, userError, router]);

  if (settling || !user || !profile?.onboardingCompleted) {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {t("loading")}
      </div>
    );
  }

  return <>{children}</>;
}
