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
    staleTime: 5 * 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previous) => previous,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: authKeys.profile,
    queryFn: () => getAuthRepository().getProfile(),
    staleTime: 5 * 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previous) => previous,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      password,
      captchaToken,
    }: {
      email: string;
      password: string;
      captchaToken?: string;
    }) => getAuthRepository().signInWithPassword(email, password, { captchaToken }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      password,
      captchaToken,
    }: {
      email: string;
      password: string;
      captchaToken?: string;
    }) => getAuthRepository().signUpWithPassword(email, password, { captchaToken }),
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
    mutationFn: ({
      email,
      captchaToken,
    }: {
      email: string;
      captchaToken?: string;
    }) => getAuthRepository().sendPasswordReset(email, { captchaToken }),
  });
}

export function useVerifySignupOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, token }: { email: string; token: string }) =>
      getAuthRepository().verifySignupOtp(email, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useResendSignupOtp() {
  return useMutation({
    mutationFn: ({
      email,
      captchaToken,
    }: {
      email: string;
      captchaToken?: string;
    }) => getAuthRepository().resendSignupOtp(email, { captchaToken }),
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      getAuthRepository().updatePassword(vars.currentPassword, vars.newPassword),
  });
}

export function useSetPasswordFromRecovery() {
  return useMutation({
    mutationFn: (newPassword: string) =>
      getAuthRepository().setPasswordFromRecovery(newPassword),
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: OnboardingAnswers) => getAuthRepository().completeOnboarding(answers),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useSetUsername() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => getAuthRepository().setUsername(username),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getAuthRepository().deleteAccount(),
    onSuccess: () => queryClient.clear(),
  });
}
