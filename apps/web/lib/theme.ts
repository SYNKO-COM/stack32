/**
 * Theme helpers — light by default, dark optional.
 * Preference is stored in localStorage + cookie for FOUC-free SSR.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "stack32.theme";
export const THEME_COOKIE = "stack32.theme";
export const DEFAULT_THEME: Theme = "light";

export function isTheme(value: string | undefined | null): value is Theme {
  return value === "light" || value === "dark";
}

export function readThemeCookie(value: string | undefined | null): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

export function applyThemeClass(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function persistTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;samesite=lax`;
}

/** Inline script for <head> — runs before paint to avoid a light/dark flash. */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var c=${JSON.stringify(THEME_COOKIE)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){var m=document.cookie.match(new RegExp("(?:^|; )"+c+"=([^;]*)"));t=m?m[1]:"light";}if(t==="dark")document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark");}catch(e){document.documentElement.classList.remove("dark");}})();`;
