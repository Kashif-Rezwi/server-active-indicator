import { useCallback, useEffect, useState } from "react";

export type DemoTheme = "light" | "dark";

const STORAGE_KEY = "sai-demo-theme";

function getInitialTheme(): DemoTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* localStorage unavailable (private mode, etc.) — fall back to OS preference */
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Demo-only theme state. The initial `data-theme` attribute is set by a tiny
 * inline script in `demo/index.html` (before first paint) and kept in sync
 * from here; persisted to localStorage, defaults to the OS preference.
 */
export function useTheme() {
  const [theme, setTheme] = useState<DemoTheme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore persistence failures */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
