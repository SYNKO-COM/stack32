"use client";

import { useEffect, useMemo } from "react";
import { I18nextProvider } from "react-i18next";

import i18n, { getI18nForLocale } from "@/lib/i18n";
import {
  isSupportedLocale,
  persistLocale,
  resolvePreferredLocale,
  DEFAULT_LOCALE,
  type Locale,
} from "@/lib/i18n/locales";

interface I18nProviderProps {
  children: React.ReactNode;
  /** Locale from the request cookie (English when absent). */
  initialLocale?: Locale;
  /** True when the request carried an explicit locale cookie. */
  hasLocaleCookie?: boolean;
}

export function I18nProvider({
  children,
  initialLocale,
  hasLocaleCookie = false,
}: I18nProviderProps) {
  const locale: Locale = initialLocale ?? DEFAULT_LOCALE;

  // Server and client both render from the cookie value the layout resolved, so
  // the markup matches and React can hydrate instead of discarding the tree.
  const instance = useMemo(() => getI18nForLocale(locale), [locale]);

  useEffect(() => {
    const applyDocumentLang = (lng: string) => {
      document.documentElement.lang = lng;
    };

    // No cookie yet: fall back to the browser preference, then remember it so
    // the next request is server-rendered in the right language from the start.
    const preferred = hasLocaleCookie ? locale : resolvePreferredLocale();
    if (preferred !== i18n.language) {
      void i18n.changeLanguage(preferred);
    }
    persistLocale(preferred);
    applyDocumentLang(preferred);

    const onChanged = (lng: string) => {
      applyDocumentLang(lng);
      if (isSupportedLocale(lng)) persistLocale(lng);
    };
    i18n.on("languageChanged", onChanged);
    return () => {
      i18n.off("languageChanged", onChanged);
    };
  }, [hasLocaleCookie, locale]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
