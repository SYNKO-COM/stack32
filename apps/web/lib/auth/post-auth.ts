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

/**
 * Open-redirect hardening: only same-origin relative paths starting with `/`.
 * Rejects protocol-relative URLs, schemes, backslashes, and common encodings.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512) return null;

  const lowerRaw = trimmed.toLowerCase();
  if (
    lowerRaw.includes("%2f%2f") ||
    lowerRaw.includes("%5c") ||
    lowerRaw.includes("%00") ||
    lowerRaw.includes("\\")
  ) {
    return null;
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return null;
  }

  const normalized = decoded.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (normalized.includes("\\")) return null;
  if (/javascript\s*:/i.test(normalized) || /data\s*:/i.test(normalized)) return null;
  if (/^\/(?:[a-z][a-z0-9+.-]*:)/i.test(normalized)) return null;
  if (/\/\/+/.test(normalized.slice(1))) return null;

  // Path + optional query/hash only (no open redirect via host).
  try {
    const asUrl = new URL(normalized, "https://stack32.invalid");
    if (asUrl.origin !== "https://stack32.invalid") return null;
    if (asUrl.username || asUrl.password) return null;
    return `${asUrl.pathname}${asUrl.search}${asUrl.hash}`;
  } catch {
    return null;
  }
}

/**
 * Only a pricing checkout should skip the post-onboarding plan picker.
 * `/agents` (OAuth default) and other app paths must still see the offers.
 */
export function isCheckoutNext(path: string | null | undefined): boolean {
  const next = safeNextPath(path);
  if (!next) return false;
  return next === "/billing/checkout" || next.startsWith("/billing/checkout?");
}

/** Onboarding URL, preserving a checkout destination when one was chosen. */
export function onboardingPathForNext(preferredNext?: string | null): string {
  const next = safeNextPath(preferredNext);
  if (next && isCheckoutNext(next)) {
    return `/onboarding?next=${encodeURIComponent(next)}`;
  }
  return "/onboarding";
}

/** Where to go after the last onboarding step. */
export function postOnboardingPath(preferredNext?: string | null): string {
  const next = safeNextPath(preferredNext);
  if (next && isCheckoutNext(next)) return next;
  return "/billing/plans";
}

/** Destination after a successful auth (client-side). */
export async function resolvePostAuthPath(
  preferredNext?: string | null,
): Promise<string> {
  const next = safeNextPath(preferredNext);
  const profile = await fetchProfileWithRetry();

  if (!profile?.onboardingCompleted) {
    return onboardingPathForNext(next);
  }

  if (next && next !== "/onboarding" && !next.startsWith("/onboarding?")) {
    return next;
  }
  return "/agents";
}
