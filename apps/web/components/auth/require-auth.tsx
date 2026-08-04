"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCurrentUser, useProfile } from "@/hooks/use-auth";

/**
 * Client-side protected-route helper (mock mode).
 * TODO(phase-2): move route protection to middleware with Supabase SSR sessions.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: profile, isLoading: profileLoading } = useProfile();

  useEffect(() => {
    if (userLoading || profileLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (profile && !profile.onboardingCompleted) {
      router.replace("/onboarding");
    }
  }, [user, profile, userLoading, profileLoading, router]);

  if (userLoading || profileLoading || !user || !profile?.onboardingCompleted) {
    return null;
  }

  return <>{children}</>;
}
