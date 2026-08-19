/**
 * useTheme.ts — Theme state hook.
 *
 * Architecture note:
 *   The theme is stored as a single `data-theme` attribute on <html>.
 *   All component styling reads from CSS variables — they never touch JS state.
 *   This means components are 100% theme-agnostic: adding a new theme means
 *   adding one CSS file. Zero component changes.
 *
 * Persistence:
 *   The choice is saved to localStorage so it survives app restarts.
 *   We also respect the OS preference via `prefers-color-scheme` on first load.
 */

import { useEffect, useState, useCallback } from "react";

export type ThemeId = "light" | "dark" | "system";

const STORAGE_KEY = "pm-theme";
const HTML_EL = document.documentElement;

/** Resolve system theme to actual light/dark based on OS preference. */
function resolveSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Read persisted preference, default to system. */
function getInitialTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
  return stored ?? "system";
}

/** Apply the theme attribute to <html> — this triggers CSS variable cascade. */
function applyTheme(theme: ThemeId): void {
  const actualTheme = theme === "system" ? resolveSystemTheme() : theme;
  HTML_EL.setAttribute("data-theme", actualTheme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const initial = getInitialTheme();
    // Apply synchronously before first paint to prevent flash.
    applyTheme(initial);
    return initial;
  });

  // Keep <html> attribute in sync whenever state changes.
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      applyTheme("system"); // Re-resolve system theme
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "system";
      return "light";
    });
  }, []);

  return { theme, setTheme, toggleTheme };
}
