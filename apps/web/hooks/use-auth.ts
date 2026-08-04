"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { OnboardingAnswers } from "@/lib/domain/types";
import { getAuthRepository } from "@/lib/repositories/factory";

const authKeys = {
  user: ["auth", "user"] as const,
  profile: ["auth", "profile"] as const,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.user,
    queryFn: () => getAuthRepository().getCurrentUser(),
    staleTime: 10_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: authKeys.profile,
    queryFn: () => getAuthRepository().getProfile(),
    staleTime: 10_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      getAuthRepository().signInWithPassword(email, password),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      getAuthRepository().signUpWithPassword(email, password),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useSignInWithGoogle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getAuthRepository().signInWithGoogle(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useSignInWithGithub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getAuthRepository().signInWithGithub(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getAuthRepository().signOut(),
    // Clear (not just invalidate) so no private data survives logout in cache.
    onSuccess: () => queryClient.clear(),
  });
}

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => getAuthRepository().sendPasswordReset(email),
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (newPassword: string) => getAuthRepository().updatePassword(newPassword),
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: OnboardingAnswers) => getAuthRepository().completeOnboarding(answers),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}
