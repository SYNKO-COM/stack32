"use client";

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import {
  isSupportedLocale,
  persistLocale,
  resolvePreferredLocale,
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
  useEffect(() => {
    const applyDocumentLang = (lng: string) => {
      document.documentElement.lang = lng;
    };

    // Hydration-safe: language is always English during SSR + first paint.
    // Only after mount do we apply the user's preference.
    const preferred = hasLocaleCookie && initialLocale
      ? initialLocale
      : resolvePreferredLocale();

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
  }, [hasLocaleCookie, initialLocale]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
