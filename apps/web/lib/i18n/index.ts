import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./locales";
import { NAMESPACES, resources } from "./resources";

/**
 * Initialize on the default locale.
 *
 * Never auto-detect at module load: a browser LanguageDetector would switch
 * the client to `fr` before hydration while the server stayed on `en`.
 *
 * The request locale is applied through `I18nProvider`, which renders server
 * and client from the same cookie-derived value — see `getI18nForLocale`.
 */
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    ns: [...NAMESPACES],
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    react: {
      useSuspense: false,
    },
  });
}

/**
 * The i18n singleton survives dev hot-reloads, so newly added JSON keys would
 * otherwise never reach the in-memory bundles. Re-registering is idempotent.
 */
for (const [lng, namespaces] of Object.entries(resources)) {
  for (const [ns, bundle] of Object.entries(namespaces)) {
    i18n.addResourceBundle(lng, ns, bundle, true, true);
  }
}

export default i18n;

/**
 * Return an i18next instance already set to `locale`, for the current render.
 *
 * Rendering the server in English and switching to French after mount only
 * avoided a mismatch on the very first page of a session: once
 * `changeLanguage` had run, every later SSR render produced English markup
 * while the client rendered French. React then threw away the server tree and
 * re-rendered — losing event handlers for a beat and logging a hydration
 * error on every navigation.
 *
 * On the server each request gets its own clone, so two concurrent visitors
 * with different locales can never observe each other's language. On the
 * client the singleton is reused, so component state survives.
 */
export function getI18nForLocale(locale: string) {
  if (typeof window === "undefined") {
    // Per-request clone: mutating the shared singleton here would leak one
    // visitor's language into another's response.
    return i18n.cloneInstance({ lng: locale });
  }
  if (i18n.language !== locale) {
    // Resources are bundled, so this resolves synchronously — safe before paint.
    void i18n.changeLanguage(locale);
  }
  return i18n;
}
