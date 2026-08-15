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

  /** Result of async retry when profile query is null. */
  const [retryComplete, setRetryComplete] = useState<boolean | null>(null);
  const resolvingRef = useRef(false);

  const settling = userLoading || profileLoading || userFetching || profileFetching;
  const knownComplete = profile?.onboardingCompleted === true;
  const knownIncomplete = Boolean(profile && !profile.onboardingCompleted);
  const needsRetry = Boolean(
    user && !userError && profile == null && !profileLoading && !userLoading && !userFetching,
  );

  useEffect(() => {
    if (userLoading || userFetching) return;

    if (userError || !user) {
      router.replace("/login");
      return;
    }

    if (knownComplete) return;

    if (knownIncomplete) {
      router.replace("/onboarding");
      return;
    }

    if (!needsRetry || resolvingRef.current) return;
    resolvingRef.current = true;

    void (async () => {
      try {
        const fresh = await fetchProfileWithRetry();
        await refetchProfile();
        if (fresh?.onboardingCompleted) {
          setRetryComplete(true);
          return;
        }
        setRetryComplete(false);
        router.replace("/onboarding");
      } finally {
        resolvingRef.current = false;
      }
    })();
  }, [
    user,
    knownComplete,
    knownIncomplete,
    needsRetry,
    userLoading,
    userFetching,
    userError,
    router,
    refetchProfile,
  ]);

  const resolvedComplete = knownComplete || retryComplete === true;

  if (settling || resolvedComplete !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <BrandLoader label={t("loading")} size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
