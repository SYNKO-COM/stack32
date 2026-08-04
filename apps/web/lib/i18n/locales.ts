/**
 * Locale registry.
 *
 * Adding a new language:
 * 1. Create `locales/<code>/` with the same JSON namespace files as `locales/en/`.
 * 2. Register the locale below and import its resources in `lib/i18n/resources.ts`.
 */

export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

export const LOCALE_STORAGE_KEY = "stack32.locale";
export const LOCALE_COOKIE = "stack32.locale";

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Read locale from a cookie header/value. Falls back to English. */
export function readLocaleCookie(value: string | undefined | null): Locale {
  if (value && isSupportedLocale(value)) return value;
  return DEFAULT_LOCALE;
}

/** Persist the user's choice for the next visit (localStorage + cookie). */
export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore quota / private mode
  }
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
}

/**
 * Browser-only preference: localStorage → navigator → English.
 * Must only run after mount to keep SSR and the first client paint identical.
 */
export function resolvePreferredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) return stored;
  } catch {
    // ignore
  }
  const nav = window.navigator.language?.slice(0, 2).toLowerCase();
  if (nav && isSupportedLocale(nav)) return nav;
  return DEFAULT_LOCALE;
}
