"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { DesktopOnboardingFlow } from "@/components/onboarding/desktop-onboarding-flow";
import { MobileOnboardingFlow } from "@/components/onboarding/mobile-onboarding-flow";
import { AuthForm } from "@/components/auth/auth-form";
import { useOnboardingExperience } from "@/lib/onboarding/device";
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
    <div className="relative min-h-dvh">
      <AnimatedBackground variant="soft" />
      <header className="sticky top-0 z-40 flex h-20 items-center justify-between bg-background/95 px-6 py-5 backdrop-blur-sm">
        <Logo href="/" size="lg" className="max-sm:gap-2.5 max-sm:[&_img]:size-8 max-sm:[&_.font-brand]:text-[1.35rem]" />
        <div className="flex items-center gap-1.5">
          <ThemeToggle size="lg" className="max-sm:[&_svg:not([class*='size-'])]:size-4" />
          <LanguageSwitcher size="lg" className="max-sm:[&_svg]:h-[15px] max-sm:[&_svg]:w-[22px]" />
        </div>
      </header>
      <main className="px-6 pb-4">
        {children}
      </main>
    </div>
  );
}

const subscribeMounted = () => () => {};

function OnboardingPageInner() {
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const { t } = useTranslation("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const experience = useOnboardingExperience();
  const mobile = experience === "mobile" || searchParams.get("experience") === "mobile";
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
    if (experience === null || mobile) return;
    if (userLoading) return;

    if (userError || !user) return;

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
    experience,
    mobile,
  ]);

  const readyForFlow = profileReadyForFlow || retryReady || startedIncomplete;

  if (!mounted || experience === null) return <OnboardingShell><BrandLoader label={t("loading")} size="lg" /></OnboardingShell>;

  if (mobile) return <OnboardingShell><MobileOnboardingFlow /></OnboardingShell>;

  if (!userLoading && !user && !userError) {
    return <OnboardingShell><div className="mx-auto max-w-md py-10"><AuthForm mode="signup" preferredNext="/onboarding" /></div></OnboardingShell>;
  }

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
      <DesktopOnboardingFlow />
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
