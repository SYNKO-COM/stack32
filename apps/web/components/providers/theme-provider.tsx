"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import {
  applyThemeClass,
  DEFAULT_THEME,
  persistTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(fallback: Theme): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignore
  }
  return fallback;
}

/**
 * Applies and toggles light/dark theme on <html>.
 * Default is light. Hydration-safe: first paint uses the inline script + cookie.
 */
export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const preferred = readStoredTheme(initialTheme);
      setThemeState(preferred);
      applyThemeClass(preferred);
      persistTheme(preferred);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [initialTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyThemeClass(next);
    persistTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      applyThemeClass(next);
      persistTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
