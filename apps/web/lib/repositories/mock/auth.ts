import type { OnboardingAnswers, Profile, User } from "@/lib/domain/types";
import { AuthUiError } from "@/lib/auth/errors";
import type { AuthRepository, SignUpResult } from "@/lib/repositories/interfaces";

import { emitMockChange } from "./events";
import { delay, readStore, removeStore, writeStore } from "./storage";

interface MockAuthState {
  user: User | null;
  profile: Profile | null;
}

const KEY = "auth";

function readState(): MockAuthState {
  return readStore<MockAuthState>(KEY, { user: null, profile: null });
}

function writeState(state: MockAuthState): void {
  writeStore(KEY, state);
  emitMockChange();
}

function makeUser(email: string): User {
  return {
    id: "user_mock",
    email,
    name: email.split("@")[0],
    hasPasswordLogin: true,
  };
}

function makeProfile(userId: string): Profile {
  return {
    userId,
    locale: "en",
    onboardingCompleted: false,
  };
}

export class MockAuthRepository implements AuthRepository {
  async getCurrentUser(): Promise<User | null> {
    return readState().user;
  }

  async signInWithPassword(
    email: string,
    _password: string,
    _options?: import("@/lib/repositories/interfaces").AuthCaptchaOptions,
  ): Promise<User> {
    await delay(500);
    const user = makeUser(email);
    const previous = readState();
    writeState({
      user,
      // Keep an existing profile (e.g. onboarding already completed).
      profile: previous.profile ?? makeProfile(user.id),
    });
    return user;
  }

  async signUpWithPassword(
    email: string,
    _password: string,
    _options?: import("@/lib/repositories/interfaces").AuthCaptchaOptions,
  ): Promise<SignUpResult> {
    await delay(600);
    // Mirror production: email signup requires OTP before a session exists.
    writeState({ user: null, profile: makeProfile("user_mock") });
    writeStore("pending_signup_email", email);
    return {
      user: makeUser(email),
      requiresEmailConfirmation: true,
    };
  }

  async verifySignupOtp(email: string, token: string): Promise<User> {
    await delay(400);
    if (token !== "123456") {
      throw new AuthUiError("auth:errors.invalidOtp");
    }
    const user = makeUser(email);
    writeState({ user, profile: makeProfile(user.id) });
    removeStore("pending_signup_email");
    return user;
  }

  async resendSignupOtp(
    _email: string,
    _options?: import("@/lib/repositories/interfaces").AuthCaptchaOptions,
  ): Promise<void> {
    await delay(400);
  }

  async signInWithGoogle(): Promise<User | null> {
    return this.signInWithOAuthMock("google");
  }

  async signInWithGithub(): Promise<User | null> {
    return this.signInWithOAuthMock("github");
  }

  private async signInWithOAuthMock(provider: "google" | "github"): Promise<User | null> {
    await delay(600);
    const user = makeUser(`${provider}@stack32.com`);
    const previous = readState();
    writeState({ user, profile: previous.profile ?? makeProfile(user.id) });
    return user;
  }

  async sendPasswordReset(
    _email: string,
    _options?: import("@/lib/repositories/interfaces").AuthCaptchaOptions,
  ): Promise<void> {
    await delay(500);
  }

  async updatePassword(_currentPassword: string, _newPassword: string): Promise<void> {
    await delay(500);
  }

  async setPasswordFromRecovery(_newPassword: string): Promise<void> {
    await delay(500);
  }

  async signOut(): Promise<void> {
    await delay(200);
    const state = readState();
    // Keep the profile so a returning mock user skips onboarding.
    writeState({ user: null, profile: state.profile });
  }

  async getProfile(): Promise<Profile | null> {
    return readState().profile;
  }

  async completeOnboarding(answers: OnboardingAnswers): Promise<Profile> {
    const state = readState();
    const userId = state.user?.id ?? "user_mock";
    const profile: Profile = {
      ...(state.profile ?? { userId, locale: "en", onboardingCompleted: false }),
      userId,
      firstName: answers.firstName,
      phone: answers.phone,
      username: answers.username?.trim().toLowerCase() || undefined,
      discoverySource: answers.discoverySource,
      role: answers.role,
      primaryUseCase: answers.primaryUseCase,
      onboardingCompleted: true,
    };
    writeState({ user: state.user, profile });
    return profile;
  }

  async setUsername(username: string): Promise<Profile> {
    await delay(200);
    const state = readState();
    if (!state.profile) throw new AuthUiError("errors:generic");
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(normalized) || normalized.includes("stack32")) {
      throw new AuthUiError("onboarding:username.invalid");
    }
    const profile: Profile = { ...state.profile, username: normalized };
    writeState({ user: state.user, profile });
    return profile;
  }

  async checkUsernameAvailability(username: string): Promise<{
    normalizedUsername: string | null;
    available: boolean;
    valid: boolean;
    reason: string | null;
  }> {
    await delay(100);
    const normalized = username.trim().toLowerCase() || null;
    if (!normalized) {
      return { normalizedUsername: null, available: false, valid: false, reason: "empty" };
    }
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(normalized)) {
      return { normalizedUsername: normalized, available: false, valid: false, reason: "invalid" };
    }
    const reserved = new Set(["admin", "api", "login", "signup", "settings", "stack32"]);
    if (reserved.has(normalized) || normalized.includes("stack32")) {
      return { normalizedUsername: normalized, available: false, valid: false, reason: "reserved" };
    }
    const taken = readState().profile?.username === normalized;
    return {
      normalizedUsername: normalized,
      available: !taken,
      valid: true,
      reason: taken ? "taken" : null,
    };
  }

  async deleteAccount(): Promise<void> {
    await delay(400);
    removeStore(KEY);
    emitMockChange();
  }
}

/** Test helper — wipes mock auth completely. */
export function resetMockAuth(): void {
  removeStore(KEY);
  emitMockChange();
}
