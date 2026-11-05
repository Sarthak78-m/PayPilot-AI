"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const ThemeContext = createContext({
  theme: "light",
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
  mounted: false,
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("light");
  const [mounted, setMounted] = useState(false);

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
    let initialTheme = "light";
    try {
      const savedTheme = localStorage.getItem("paypilot_theme");
      if (savedTheme === "dark" || savedTheme === "light") {
        initialTheme = savedTheme;
      } else {
        // Clear any corrupted legacy value
        if (savedTheme) {
          localStorage.removeItem("paypilot_theme");
        }
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
          initialTheme = "dark";
        }
      }
    } catch {
      // localStorage unavailable (e.g. security sandbox)
    }

    setThemeState(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);
  }, [applyTheme]);

  const setTheme = useCallback(
    (newThemeOrUpdater) => {
      setThemeState((prevTheme) => {
        const resolved =
          typeof newThemeOrUpdater === "function"
            ? newThemeOrUpdater(prevTheme)
            : newThemeOrUpdater;
        const sanitized = resolved === "dark" ? "dark" : "light";

        applyTheme(sanitized);
        try {
          localStorage.setItem("paypilot_theme", sanitized);
        } catch {}

        return sanitized;
      });
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
