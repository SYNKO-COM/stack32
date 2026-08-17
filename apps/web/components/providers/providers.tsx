"use client";

import { MockSync } from "@/hooks/use-mock-sync";
import type { ConsentState } from "@/lib/consent";
import type { Locale } from "@/lib/i18n/locales";
import type { Theme } from "@/lib/theme";

import { CookieConsentRoot } from "@/components/consent/cookie-consent-root";
import { AuthSessionSync } from "./auth-session-sync";
import { I18nProvider } from "./i18n-provider";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

export function Providers({
  children,
  initialLocale,
  hasLocaleCookie,
  initialTheme,
  initialConsent,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
  hasLocaleCookie?: boolean;
  initialTheme?: Theme;
  initialConsent?: ConsentState | null;
}) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <I18nProvider initialLocale={initialLocale} hasLocaleCookie={hasLocaleCookie}>
        <QueryProvider>
          <AuthSessionSync />
          <MockSync />
          <CookieConsentRoot initialConsent={initialConsent ?? null}>
            {children}
          </CookieConsentRoot>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
