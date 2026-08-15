import type { Profile } from "@/lib/domain/types";
import { getAuthRepository } from "@/lib/repositories/factory";

const DEFAULT_RETRIES = 5;
const RETRY_DELAY_MS = 250;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Fetch the current profile with short retries.
 * Right after sign-in / OAuth the profile row (or RLS session) can lag by a
 * few hundred ms — treating that as "needs onboarding" sends completed users
 * to /onboarding until a hard refresh.
 */
export async function fetchProfileWithRetry(
  retries = DEFAULT_RETRIES,
  delayMs = RETRY_DELAY_MS,
): Promise<Profile | null> {
  const auth = getAuthRepository();
  let profile = await auth.getProfile();
  for (let i = 0; i < retries && !profile; i += 1) {
    await wait(delayMs);
    profile = await auth.getProfile();
  }
  return profile;
}

/** Destination after a successful auth (client-side). */
export async function resolvePostAuthPath(
  preferredNext?: string | null,
): Promise<string> {
  if (preferredNext?.startsWith("/") && !preferredNext.startsWith("//")) {
    // Still honour next for password-reset etc., but never trap completed
    // users on /onboarding when they already finished it.
    if (preferredNext !== "/onboarding") return preferredNext;
  }
  const profile = await fetchProfileWithRetry();
  return profile?.onboardingCompleted ? "/agents" : "/onboarding";
}
