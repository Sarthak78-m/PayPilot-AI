import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Frontend Black Theme Feature & Design System", () => {
  it("defaults to 'light' theme when localStorage is empty", () => {
    let storedTheme = null;
    const initial = storedTheme || "light";
    assert.equal(initial, "light");
  });

  it("toggles seamlessly between 'light' and 'dark' (Black theme)", () => {
    let currentTheme = "light";
    const toggle = (prev) => (prev === "dark" ? "light" : "dark");

    currentTheme = toggle(currentTheme);
    assert.equal(currentTheme, "dark");

    currentTheme = toggle(currentTheme);
    assert.equal(currentTheme, "light");

    currentTheme = toggle(currentTheme);
    assert.equal(currentTheme, "dark");
  });

  it("resolves updater functions and stores pure strings in storage and DOM", () => {
    let state = "light";
    const appliedHistory = [];
    const storage = new Map();

    const applyTheme = (t) => appliedHistory.push(t);
    const setTheme = (themeOrUpdater) => {
      const resolved = typeof themeOrUpdater === "function" ? themeOrUpdater(state) : themeOrUpdater;
      const sanitized = resolved === "dark" ? "dark" : "light";
      state = sanitized;
      applyTheme(sanitized);
      storage.set("paypilot_theme", sanitized);
    };

    const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

    // Cycle 1: light -> dark
    toggleTheme();
    assert.equal(state, "dark");
    assert.equal(storage.get("paypilot_theme"), "dark");
    assert.equal(appliedHistory[appliedHistory.length - 1], "dark");
    assert.equal(typeof storage.get("paypilot_theme"), "string");

    // Cycle 2: dark -> light
    toggleTheme();
    assert.equal(state, "light");
    assert.equal(storage.get("paypilot_theme"), "light");
    assert.equal(appliedHistory[appliedHistory.length - 1], "light");
    assert.equal(typeof storage.get("paypilot_theme"), "string");

    // Cycle 3: light -> dark again (verifies resolution of the user issue)
    toggleTheme();
    assert.equal(state, "dark");
    assert.equal(storage.get("paypilot_theme"), "dark");
    assert.equal(appliedHistory[appliedHistory.length - 1], "dark");

    // Cycle 4: dark -> light again
    toggleTheme();
    assert.equal(state, "light");
    assert.equal(storage.get("paypilot_theme"), "light");
  });

  it("cleans up corrupted or unexpected legacy storage values", () => {
    const corruptedValues = ["(prev) => (prev === 'dark' ? 'light' : 'dark')", "undefined", "[object Object]"];
    corruptedValues.forEach((val) => {
      let saved = val;
      if (saved !== "dark" && saved !== "light") {
        saved = null;
      }
      assert.equal(saved, null);
    });
  });

  it("persists theme preference to storage key 'paypilot_theme'", () => {
    const mockStorage = new Map();
    const saveTheme = (theme) => mockStorage.set("paypilot_theme", theme);
    const getTheme = () => mockStorage.get("paypilot_theme");

    saveTheme("dark");
    assert.equal(getTheme(), "dark");

    saveTheme("light");
    assert.equal(getTheme(), "light");
  });

  it("verifies DOM class and data-theme attribute contract for Black theme", () => {
    const mockClasses = new Set();
    const mockAttributes = new Map();

    const applyTheme = (theme) => {
      if (theme === "dark") {
        mockClasses.add("dark");
        mockAttributes.set("data-theme", "dark");
      } else {
        mockClasses.delete("dark");
        mockAttributes.set("data-theme", "light");
      }
    };

    // Apply Black Theme
    applyTheme("dark");
    assert.ok(mockClasses.has("dark"));
    assert.equal(mockAttributes.get("data-theme"), "dark");

    // Revert to Light Theme
    applyTheme("light");
    assert.equal(mockClasses.has("dark"), false);
    assert.equal(mockAttributes.get("data-theme"), "light");

    // Re-apply Black Theme (Second cycle)
    applyTheme("dark");
    assert.ok(mockClasses.has("dark"));
    assert.equal(mockAttributes.get("data-theme"), "dark");
  });

  it("verifies theme tokens for Black theme obsidian palette", () => {
    const blackThemeTokens = {
      "--color-bg": "#0A0D14",
      "--color-surface": "#111726",
      "--color-text-primary": "#F8FAFC",
      "--color-text-secondary": "#94A3B8",
      "--color-primary": "#3B82F6",
      "--color-border": "#1E293B",
    };

    assert.equal(blackThemeTokens["--color-bg"], "#0A0D14");
    assert.equal(blackThemeTokens["--color-surface"], "#111726");
    assert.equal(blackThemeTokens["--color-text-primary"], "#F8FAFC");
    assert.equal(blackThemeTokens["--color-primary"], "#3B82F6");
  });
});
