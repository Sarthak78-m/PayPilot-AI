"use client";

import React from "react";
import { useTheme } from "@/lib/context/theme-context";
import { Sun, Moon } from "@/components/icons";

export function ThemeToggle({
  variant = "icon",
  size = "md",
  className = "",
  showLabel = false,
  ...props
}) {
  const { theme, isDark, toggleTheme, setTheme, mounted } = useTheme();

  // Prevents hydration mismatch while rendering icon placeholder
  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        className={`inline-flex items-center justify-center p-2 rounded-xl text-[#64748B] opacity-70 bg-[#E8EDF4] shadow-raised-sm ${className}`}
        aria-label="Loading theme"
        {...props}
      >
        <span className="h-4 w-4 block" />
      </button>
    );
  }

  if (variant === "pill") {
    return (
      <div
        className={`inline-flex items-center p-1 rounded-xl bg-[#E8EDF4] dark:bg-[#0D121D] shadow-inset-sm border border-[#CBD5E1]/60 dark:border-white/10 ${className}`}
        role="group"
        aria-label="Theme selection"
        {...props}
      >
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none ${
            !isDark
              ? "bg-[#2563EB] text-white shadow-primary-glow"
              : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC]"
          }`}
          aria-pressed={!isDark}
        >
          <Sun className="h-3.5 w-3.5" />
          <span>Light</span>
        </button>

        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none ${
            isDark
              ? "bg-[#3B82F6] text-white shadow-primary-glow"
              : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC]"
          }`}
          aria-pressed={isDark}
        >
          <Moon className="h-3.5 w-3.5" />
          <span>Black</span>
        </button>
      </div>
    );
  }

  const sizeClasses = {
    sm: "p-2 min-h-[36px] min-w-[36px] text-xs gap-1.5 rounded-xl",
    md: "p-2.5 min-h-[42px] min-w-[42px] text-sm gap-2 rounded-xl",
    lg: "px-4 py-2.5 min-h-[48px] text-base gap-2.5 rounded-xl",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const label = isDark ? "Switch to Light Theme" : "Switch to Black Theme";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center font-medium bg-[#E8EDF4] dark:bg-[#111726] text-[#172033] dark:text-[#F8FAFC] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] select-none border border-white/60 dark:border-white/10 ${
        sizeClasses[size] || sizeClasses.md
      } ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {isDark ? (
        <Sun
          className={`${iconSizes[size] || "h-4 w-4"} text-[#F59E0B] transition-transform duration-300 hover:rotate-45`}
        />
      ) : (
        <Moon
          className={`${iconSizes[size] || "h-4 w-4"} text-[#64748B] dark:text-[#94A3B8] hover:text-[#172033] dark:hover:text-[#F8FAFC] transition-transform duration-300 hover:-rotate-12`}
        />
      )}

      {(showLabel || variant === "button") && (
        <span className="font-semibold text-xs tracking-tight">
          {isDark ? "Light Theme" : "Black Theme"}
        </span>
      )}
    </button>
  );
}

