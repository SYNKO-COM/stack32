import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./locales";
import { NAMESPACES, resources } from "./resources";

/**
 * Always initialize on the default locale.
 *
 * Do NOT auto-detect language at module load: Client Components are SSR'd
 * with this singleton, and a browser LanguageDetector would switch to `fr`
 * on the client before hydration while the server stayed on `en` — causing
 * a hydration mismatch (and a costly client re-render).
 *
 * Preferred language is applied after mount in `I18nProvider`.
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
