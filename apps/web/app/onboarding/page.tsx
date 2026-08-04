"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useCurrentUser, useProfile } from "@/hooks/use-auth";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: profile, isLoading: profileLoading } = useProfile();

  useEffect(() => {
    if (userLoading || profileLoading) return;
    if (!user) {
      router.replace("/signup");
      return;
    }
    if (profile?.onboardingCompleted) {
      router.replace("/agents");
    }
  }, [user, profile, userLoading, profileLoading, router]);

  if (!user || profile?.onboardingCompleted) return null;

  return (
    <div className="relative min-h-screen">
      <AnimatedBackground variant="soft" />
      <div className="bg-dotted-grid-fine pointer-events-none fixed inset-0 -z-10 opacity-50" />
      <header className="flex items-center justify-between px-6 py-5">
        <Logo href="/" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="flex min-h-[calc(100vh-80px)] items-center justify-center px-6 pb-16">
        <OnboardingFlow />
      </main>
    </div>
  );
}
