"use client";

import { CookieBanner } from "@/components/consent/cookie-banner";
import { ConsentProvider } from "@/components/consent/consent-provider";
import { CookiePreferencesDialog } from "@/components/consent/cookie-preferences";
import type { ConsentState } from "@/lib/consent";

export function CookieConsentRoot({
  children,
  initialConsent,
}: {
  children: React.ReactNode;
  initialConsent: ConsentState | null;
}) {
  return (
    <ConsentProvider initialConsent={initialConsent}>
      {children}
      <CookieBanner />
      <CookiePreferencesDialog />
    </ConsentProvider>
  );
}
