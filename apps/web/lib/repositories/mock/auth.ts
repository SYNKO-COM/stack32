import type { OnboardingAnswers, Profile, User } from "@/lib/domain/types";
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

  async signInWithPassword(email: string, _password: string): Promise<User> {
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

  async signUpWithPassword(email: string, _password: string): Promise<SignUpResult> {
    await delay(600);
    const user = makeUser(email);
    writeState({ user, profile: makeProfile(user.id) });
    return { user, requiresEmailConfirmation: false };
  }

  async signInWithGoogle(): Promise<User | null> {
    await delay(600);
    const user = makeUser("demo@stack32.com");
    const previous = readState();
    writeState({ user, profile: previous.profile ?? makeProfile(user.id) });
    return user;
  }

  async sendPasswordReset(_email: string): Promise<void> {
    await delay(500);
  }

  async updatePassword(_newPassword: string): Promise<void> {
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
      discoverySource: answers.discoverySource,
      role: answers.role,
      primaryUseCase: answers.primaryUseCase,
      onboardingCompleted: true,
    };
    writeState({ user: state.user, profile });
    return profile;
  }
}

/** Test helper — wipes mock auth completely. */
export function resetMockAuth(): void {
  removeStore(KEY);
  emitMockChange();
}
