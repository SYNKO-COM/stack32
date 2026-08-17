/**
 * First-party cookie consent (CMP).
 *
 * Default is deny: analytics and marketing scripts must not load until the
 * visitor makes an explicit choice. Strictly necessary cookies stay on.
 *
 * Consent is stored for 13 months (CNIL recommendation), then we ask again.
 * Global Privacy Control opts the visitor out of advertising/share pixels.
 */

export const CONSENT_COOKIE = "stack32_consent";
export const CONSENT_VERSION = 1 as const;
/** 13 × 30 days — CNIL maximum lifetime for a consent signal. */
export const CONSENT_MAX_AGE_SECONDS = 13 * 30 * 24 * 60 * 60;
export const CONSENT_MAX_AGE_MS = CONSENT_MAX_AGE_SECONDS * 1000;

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export type ConsentState = {
  version: typeof CONSENT_VERSION;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: number;
};

type StoredConsent = {
  v: typeof CONSENT_VERSION;
  analytics: boolean;
  marketing: boolean;
  ts: number;
};

const EMPTY_DENIED: ConsentState = {
  version: CONSENT_VERSION,
  necessary: true,
  analytics: false,
  marketing: false,
  updatedAt: 0,
};

export function defaultDeniedConsent(updatedAt = Date.now()): ConsentState {
  return {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: false,
    marketing: false,
    updatedAt,
  };
}

export function acceptAllConsent(updatedAt = Date.now()): ConsentState {
  return {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: true,
    marketing: true,
    updatedAt,
  };
}

export function hasGpc(navigatorLike?: { globalPrivacyControl?: boolean }): boolean {
  const nav =
    navigatorLike ??
    (typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { globalPrivacyControl?: boolean }));
  return nav?.globalPrivacyControl === true;
}

export function isConsentExpired(consent: ConsentState, now = Date.now()): boolean {
  if (!consent.updatedAt) return true;
  return now - consent.updatedAt > CONSENT_MAX_AGE_MS;
}

export function parseConsentCookie(
  raw: string | undefined | null,
  now = Date.now(),
): ConsentState | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as Partial<StoredConsent>;
    if (parsed.v !== CONSENT_VERSION) return null;
    if (typeof parsed.analytics !== "boolean") return null;
    if (typeof parsed.marketing !== "boolean") return null;
    if (typeof parsed.ts !== "number" || !Number.isFinite(parsed.ts)) return null;
    const consent: ConsentState = {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: parsed.analytics,
      marketing: parsed.marketing,
      updatedAt: parsed.ts,
    };
    if (isConsentExpired(consent, now)) return null;
    return consent;
  } catch {
    return null;
  }
}

export function serializeConsentCookie(consent: ConsentState): string {
  const stored: StoredConsent = {
    v: CONSENT_VERSION,
    analytics: consent.analytics,
    marketing: consent.marketing,
    ts: consent.updatedAt,
  };
  return encodeURIComponent(JSON.stringify(stored));
}

export function persistConsent(consent: ConsentState): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? ";secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${serializeConsentCookie(consent)};path=/;max-age=${CONSENT_MAX_AGE_SECONDS};samesite=lax${secure}`;
}

export function readConsentFromDocument(): ConsentState | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CONSENT_COOKIE.replace(".", "\\.")}=([^;]*)`),
  );
  return parseConsentCookie(match?.[1]);
}

/** Effective flags used to load scripts. Unchosen = denied. */
export function allowsAnalytics(consent: ConsentState | null): boolean {
  return Boolean(consent?.analytics);
}

export function allowsMarketing(
  consent: ConsentState | null,
  navigatorLike?: { globalPrivacyControl?: boolean },
): boolean {
  if (hasGpc(navigatorLike)) return false;
  return Boolean(consent?.marketing);
}

export function effectiveConsent(
  consent: ConsentState | null,
  navigatorLike?: { globalPrivacyControl?: boolean },
): ConsentState {
  const base = consent ?? EMPTY_DENIED;
  return {
    ...base,
    necessary: true,
    analytics: allowsAnalytics(consent),
    marketing: allowsMarketing(consent, navigatorLike),
  };
}
