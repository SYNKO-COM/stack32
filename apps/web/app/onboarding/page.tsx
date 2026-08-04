"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useCurrentUser, useProfile } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";

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
    refetch: refetchUser,
  } = useCurrentUser();
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useProfile();

  const settling = userLoading || profileLoading;

  useEffect(() => {
    if (settling) return;
    if (userError || !user) {
      router.replace("/signup");
      return;
    }
    if (profile?.onboardingCompleted) {
      router.replace("/agents");
    }
  }, [user, profile, settling, userError, router]);

  if (settling) {
    return (
      <OnboardingShell>
        <div
          className="flex flex-col items-center gap-3 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <div className="size-8 animate-pulse rounded-full bg-brand/30" />
          <p>{t("loading")}</p>
        </div>
      </OnboardingShell>
    );
  }

  if (userError || !user || profile?.onboardingCompleted) {
    return (
      <OnboardingShell>
        <div className="text-sm text-muted-foreground" role="status">
          {t("loading")}
        </div>
      </OnboardingShell>
    );
  }

  // Profile may still be null briefly for a brand-new auth user (trigger lag);
  // treat missing profile as "onboarding not completed".
  if (profileError) {
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
