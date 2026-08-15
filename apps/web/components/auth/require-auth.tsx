"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandLoader } from "@/components/shared/brand-loader";
import { useCurrentUser, useProfile } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { fetchProfileWithRetry } from "@/lib/auth/post-auth";

/**
 * Client-side gate for authenticated, onboarding-complete routes.
 * Middleware already blocks anonymous users; this prevents private flash
 * and redirects incomplete profiles to /onboarding.
 *
 * Important: a missing profile is NOT treated as incomplete — it often means
 * the session/RLS just settled. We retry before deciding.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { data: user, isLoading: userLoading, isError: userError, isFetching: userFetching } =
    useCurrentUser();
  const {
    data: profile,
    isLoading: profileLoading,
    isFetching: profileFetching,
    refetch: refetchProfile,
  } = useProfile();

  const [resolvedComplete, setResolvedComplete] = useState<boolean | null>(null);
  const resolvingRef = useRef(false);

  const settling = userLoading || profileLoading || userFetching || profileFetching;

  useEffect(() => {
    if (userLoading || userFetching) return;

    if (userError || !user) {
      setResolvedComplete(null);
      router.replace("/login");
      return;
    }

    if (profile?.onboardingCompleted) {
      setResolvedComplete(true);
      return;
    }

    // Explicit incomplete onboarding — only when we have a real profile row.
    if (profile && !profile.onboardingCompleted) {
      setResolvedComplete(false);
      router.replace("/onboarding");
      return;
    }

    // profile is null/undefined: retry before sending anyone to onboarding.
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResolvedComplete(null);

    void (async () => {
      try {
        const fresh = await fetchProfileWithRetry();
        await refetchProfile();
        if (fresh?.onboardingCompleted) {
          setResolvedComplete(true);
          return;
        }
        setResolvedComplete(false);
        router.replace("/onboarding");
      } finally {
        resolvingRef.current = false;
      }
    })();
  }, [
    user,
    profile,
    userLoading,
    userFetching,
    userError,
    router,
    refetchProfile,
  ]);

  if (settling || resolvedComplete !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <BrandLoader label={t("loading")} size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
