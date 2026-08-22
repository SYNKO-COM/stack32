"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { BrandLoader } from "@/components/shared/brand-loader";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useCurrentUser, useProfile } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { fetchProfileWithRetry, safeNextPath } from "@/lib/auth/post-auth";

function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <AnimatedBackground variant="soft" />
      <header className="flex items-center justify-between px-6 py-5">
        <Logo href="/" size="lg" />
        <div className="flex items-center gap-1.5">
          <ThemeToggle size="lg" />
          <LanguageSwitcher size="lg" />
        </div>
      </header>
      <main className="flex min-h-[calc(100vh-80px)] items-center justify-center px-6 pb-16">
        {children}
      </main>
    </div>
  );
}

function OnboardingPageInner() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    data: user,
    isLoading: userLoading,
    isError: userError,
    refetch: refetchUser,
  } = useCurrentUser();
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useProfile();

  /** Only set after async profile retry when the query returned null. */
  const [retryReady, setRetryReady] = useState(false);
  const resolvingRef = useRef(false);
  /** True once we showed the wizard — don't steal navigation when it completes.
   *  State, not a ref: it gates the render branch below, and reading a ref
   *  during render is not safe under concurrent rendering. */
  const [startedIncomplete, setStartedIncomplete] = useState(false);
  const startedIncompleteRef = useRef(false);

  const settling = userLoading || profileLoading;
  const profileReadyForFlow = Boolean(profile && !profile.onboardingCompleted);
  const needsProfileRetry = Boolean(
    user && !userError && !profile && !profileLoading && !userLoading,
  );

  useEffect(() => {
    if (userLoading) return;

    if (userError || !user) {
      router.replace("/signup");
      return;
    }

    if (profile && !profile.onboardingCompleted) {
      startedIncompleteRef.current = true;
      setStartedIncomplete(true);
    }

    if (profile?.onboardingCompleted) {
      if (startedIncompleteRef.current) return;
      router.replace(safeNextPath(searchParams.get("next")) ?? "/agents");
      return;
    }

    if (profileReadyForFlow || !needsProfileRetry) return;
    if (resolvingRef.current) return;
    resolvingRef.current = true;

    void (async () => {
      try {
        const fresh = await fetchProfileWithRetry();
        await refetchProfile();
        if (fresh?.onboardingCompleted) {
          if (!startedIncompleteRef.current) {
            router.replace(safeNextPath(searchParams.get("next")) ?? "/agents");
          }
          return;
        }
        setRetryReady(true);
      } finally {
        resolvingRef.current = false;
      }
    })();
  }, [
    user,
    profile,
    profileReadyForFlow,
    needsProfileRetry,
    userLoading,
    userError,
    router,
    refetchProfile,
    searchParams,
  ]);

  const readyForFlow = profileReadyForFlow || retryReady;

  if (settling || !readyForFlow || (profile?.onboardingCompleted && !startedIncomplete)) {
    return (
      <OnboardingShell>
        <BrandLoader label={t("loading")} size="lg" />
      </OnboardingShell>
    );
  }

  if (profileError && !profile) {
    return (
      <OnboardingShell>
        <div className="max-w-sm space-y-3 text-center text-sm" role="alert">
          <p className="text-muted-foreground">{t("loading")}</p>
          <button
            type="button"
            className="text-brand underline-offset-2 hover:underline"
            onClick={() => {
              void refetchUser();
              void refetchProfile();
            }}
          >
            {t("actions.retry")}
          </button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell>
      <OnboardingFlow />
    </OnboardingShell>
  );
}

export default function OnboardingPage() {
  const { t } = useTranslation("common");
  return (
    <Suspense
      fallback={
        <OnboardingShell>
          <BrandLoader label={t("loading")} size="lg" />
        </OnboardingShell>
      }
    >
      <OnboardingPageInner />
    </Suspense>
  );
}
