import { describe, expect, it } from "vitest";

import i18n, { getI18nForLocale } from "@/lib/i18n";

/**
 * Production/dev bug this locks down: the server always rendered English and
 * the client switched to French after mount. That only avoided a mismatch on
 * the first page of a session — once changeLanguage had run, every later SSR
 * render produced English markup against a French client render. React threw
 * away the server tree and re-rendered, logging
 * "Hydration failed because the server rendered text didn't match the client"
 * and leaving the page briefly without event handlers.
 *
 * Observed on /auth/confirmed: server "You're all set" vs client
 * "C'est enregistré".
 */
describe("getI18nForLocale", () => {
  it("returns an instance already set to the requested locale", () => {
    expect(getI18nForLocale("fr").language).toBe("fr");
    expect(getI18nForLocale("en").language).toBe("en");
  });

  it("resolves translations in that locale immediately, with no async step", () => {
    const fr = getI18nForLocale("fr");
    const en = getI18nForLocale("en");
    expect(fr.t("auth:confirmed.title")).not.toBe(en.t("auth:confirmed.title"));
    expect(fr.t("auth:confirmed.title")).toBeTruthy();
  });

  it("gives each server render its own instance so locales cannot leak between requests", () => {
    // vitest runs in node: typeof window === "undefined", the server path.
    const a = getI18nForLocale("fr");
    const b = getI18nForLocale("en");
    expect(a).not.toBe(b);
    expect(a.language).toBe("fr");
    expect(b.language).toBe("en");
    // The shared singleton must not have been mutated by either render.
    expect(i18n.language).toBe("en");
  });

  it("keeps the default locale working when no cookie was sent", () => {
    expect(getI18nForLocale("en").t("auth:confirmed.title")).toBeTruthy();
  });
});
