import type { OnboardingAnswers, Profile, User } from "@/lib/domain/types";
import { AuthUiError } from "@/lib/auth/errors";
import { mapProfile, mapSupabaseUser } from "@/lib/domain/mappers";
import { publicEnv } from "@/lib/env";
import { requireSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuthRepository, SignUpResult } from "@/lib/repositories/interfaces";

function appOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return publicEnv.NEXT_PUBLIC_APP_URL;
}

export class SupabaseAuthRepository implements AuthRepository {
  async getCurrentUser(): Promise<User | null> {
    const supabase = requireSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? mapSupabaseUser(user) : null;
  }

  async signInWithPassword(email: string, password: string): Promise<User> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return mapSupabaseUser(data.user);
  }

  async signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Link fallback → success page; primary UX is the 6-digit OTP page.
        emailRedirectTo: `${appOrigin()}/auth/confirm?next=${encodeURIComponent("/auth/confirmed")}`,
      },
    });
    if (error) throw error;
    if (!data.user) throw new AuthUiError("errors:generic");
    // With email confirmation enabled there is no session yet.
    return {
      user: mapSupabaseUser(data.user),
      requiresEmailConfirmation: data.session === null,
    };
  }

  async verifySignupOtp(email: string, token: string): Promise<User> {
    const supabase = requireSupabaseBrowserClient();
    let result = await supabase.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });
    // Some projects deliver the same code as type "email".
    if (result.error) {
      result = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
    }
    if (result.error) throw result.error;
    if (!result.data.user) throw new AuthUiError("errors:generic");
    return mapSupabaseUser(result.data.user);
  }

  async resendSignupOtp(email: string): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${appOrigin()}/auth/confirm?next=${encodeURIComponent("/auth/confirmed")}`,
      },
    });
    if (error) throw error;
  }

  async signInWithGoogle(): Promise<User | null> {
    return this.signInWithOAuthProvider("google");
  }

  async signInWithGithub(): Promise<User | null> {
    return this.signInWithOAuthProvider("github");
  }

  private async signInWithOAuthProvider(
    provider: "google" | "github",
  ): Promise<User | null> {
    const supabase = requireSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${appOrigin()}/auth/callback?next=/agents`,
      },
    });
    if (error) throw error;
    // The browser is being redirected to the provider; there is no user yet.
    return null;
  }

  async sendPasswordReset(email: string): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appOrigin()}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
    });
    if (error) throw error;
  }

  async updatePassword(newPassword: string): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const supabase = requireSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async getProfile(): Promise<Profile | null> {
    const supabase = requireSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [{ data: profile }, { data: onboarding }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("onboarding_responses").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!profile) return null;
    return mapProfile(profile, onboarding);
  }

  async completeOnboarding(answers: OnboardingAnswers): Promise<Profile> {
    const supabase = requireSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("complete_onboarding", {
      p_discovery_source: answers.discoverySource ?? "other",
      p_role: answers.role ?? "other",
      p_first_name: answers.firstName,
      p_phone: answers.phone,
      p_primary_goal: answers.primaryUseCase,
    });
    if (error) throw error;
    const { data: onboarding } = await supabase
      .from("onboarding_responses")
      .select("*")
      .eq("user_id", data.id)
      .maybeSingle();
    return mapProfile(data, onboarding);
  }
}
