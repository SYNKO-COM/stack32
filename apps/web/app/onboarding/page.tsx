"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { BrandLoader } from "@/components/shared/brand-loader";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useCurrentUser, useProfile } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { fetchProfileWithRetry } from "@/lib/auth/post-auth";

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

export default function OnboardingPage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const {
    data: user,
    isLoading: userLoading,
    isError: userError,
    isFetching: userFetching,
    refetch: refetchUser,
  } = useCurrentUser();
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    isFetching: profileFetching,
    refetch: refetchProfile,
  } = useProfile();

  const [readyForFlow, setReadyForFlow] = useState(false);
  const resolvingRef = useRef(false);

  const settling = userLoading || profileLoading || userFetching || profileFetching;

  useEffect(() => {
    if (userLoading || userFetching) return;

    if (userError || !user) {
      router.replace("/signup");
      return;
    }

    if (profile?.onboardingCompleted) {
      router.replace("/agents");
      return;
    }

    if (profile && !profile.onboardingCompleted) {
      setReadyForFlow(true);
      return;
    }

    // Null profile: retry — do not flash the onboarding form for completed users.
    if (resolvingRef.current) return;
    resolvingRef.current = true;

    void (async () => {
      try {
        const fresh = await fetchProfileWithRetry();
        await refetchProfile();
        if (fresh?.onboardingCompleted) {
          router.replace("/agents");
          return;
        }
        // New user (or still no row after retries): show the flow.
        setReadyForFlow(true);
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

  if (settling || !readyForFlow || profile?.onboardingCompleted) {
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
