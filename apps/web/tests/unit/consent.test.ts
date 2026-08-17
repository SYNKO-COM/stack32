import { describe, expect, it } from "vitest";

import {
  CONSENT_MAX_AGE_MS,
  acceptAllConsent,
  allowsAnalytics,
  allowsMarketing,
  defaultDeniedConsent,
  effectiveConsent,
  hasGpc,
  parseConsentCookie,
  serializeConsentCookie,
} from "@/lib/consent";

describe("consent cookie", () => {
  it("round-trips a stored choice", () => {
    const consent = acceptAllConsent(1_700_000_000_000);
    const parsed = parseConsentCookie(serializeConsentCookie(consent), 1_700_000_000_000);
    expect(parsed).toEqual(consent);
  });

  it("treats missing or garbage values as no choice", () => {
    expect(parseConsentCookie(undefined)).toBeNull();
    expect(parseConsentCookie("not-json")).toBeNull();
    expect(parseConsentCookie(encodeURIComponent("{}"))).toBeNull();
  });

  it("expires after 13 months and asks again", () => {
    const consent = defaultDeniedConsent(1_000);
    const serialized = serializeConsentCookie(consent);
    expect(parseConsentCookie(serialized, 1_000 + CONSENT_MAX_AGE_MS + 1)).toBeNull();
    expect(parseConsentCookie(serialized, 1_000 + CONSENT_MAX_AGE_MS - 1)).toEqual(consent);
  });

  it("denies optional trackers until an explicit grant", () => {
    expect(allowsAnalytics(null)).toBe(false);
    expect(allowsMarketing(null)).toBe(false);
    expect(allowsAnalytics(defaultDeniedConsent())).toBe(false);
    expect(allowsMarketing(acceptAllConsent())).toBe(true);
  });

  it("honours Global Privacy Control for advertising pixels", () => {
    expect(hasGpc({ globalPrivacyControl: true })).toBe(true);
    expect(allowsMarketing(acceptAllConsent(), { globalPrivacyControl: true })).toBe(
      false,
    );
    expect(allowsAnalytics(acceptAllConsent())).toBe(true);
    expect(effectiveConsent(acceptAllConsent(), { globalPrivacyControl: true }).marketing).toBe(
      false,
    );
  });
});
