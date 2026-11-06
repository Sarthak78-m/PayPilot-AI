"use client";

import React, { createContext, useContext, useEffect, useCallback, useSyncExternalStore } from "react";

const ThemeContext = createContext({
  theme: "light",
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
  mounted: false,
});

const emptySubscribe = () => () => {};

const themeListeners = new Set();
function subscribeTheme(callback) {
  themeListeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    themeListeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

function notifyThemeListeners() {
  themeListeners.forEach((fn) => fn());
}

function getStoredThemeSnapshot() {
  if (typeof window === "undefined") return "light";
  try {
    const savedTheme = localStorage.getItem("paypilot_theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }
    // Clear any corrupted legacy value
    if (savedTheme) {
      localStorage.removeItem("paypilot_theme");
    }
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch {
    // localStorage unavailable
  }
  return "light";
}

function getStoredThemeServerSnapshot() {
  return "light";
}

export function ThemeProvider({ children }) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const theme = useSyncExternalStore(subscribeTheme, getStoredThemeSnapshot, getStoredThemeServerSnapshot);

  const applyTheme = useCallback((targetTheme) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const body = document.body;
    const isDarkTarget = targetTheme === "dark";

    if (isDarkTarget) {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
      if (body) {
        body.classList.add("dark");
        body.setAttribute("data-theme", "dark");
      }
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      if (body) {
        body.classList.remove("dark");
        body.setAttribute("data-theme", "light");
      }
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const setTheme = useCallback(
    (newThemeOrUpdater) => {
      const currentTheme = getStoredThemeSnapshot();
      const resolved =
        typeof newThemeOrUpdater === "function"
          ? newThemeOrUpdater(currentTheme)
          : newThemeOrUpdater;
      const sanitized = resolved === "dark" ? "dark" : "light";

      applyTheme(sanitized);
      try {
        localStorage.setItem("paypilot_theme", sanitized);
      } catch {}

      notifyThemeListeners();
    },
    [applyTheme]
  );

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  }, [setTheme]);

  const isDark = theme === "dark";

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
