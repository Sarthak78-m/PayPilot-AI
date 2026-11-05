"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-lg",
  showCloseButton = true,
  className = "",
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);

      return () => {
        document.body.style.overflow = originalOverflow || "unset";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!mounted || !isOpen || typeof document === "undefined") return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      {/* Full-viewport Backdrop */}
      <div
        className="fixed inset-0 bg-[#172033]/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centering Layout Container */}
      <div
        className="flex min-h-full items-center justify-center p-4 sm:p-6 text-center"
        onClick={onClose}
      >
        {/* Modal Dialog Card */}
        <div
          className={`relative w-full ${maxWidth} bg-[#E8EDF4] dark:bg-[#111726] shadow-raised-lg dark:shadow-[0_20px_50px_rgba(0,0,0,0.85)] rounded-3xl p-6 sm:p-8 border border-white/80 dark:border-white/10 text-left z-10 transition-all duration-200 ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              {title && (
                <h2
                  id="modal-title"
                  className="text-xl font-bold text-[#172033] dark:text-[#F8FAFC] tracking-tight"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-[#64748B] dark:text-[#94A3B8] mt-1">
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-full text-[#64748B] hover:text-[#172033] dark:text-[#94A3B8] dark:hover:text-[#F8FAFC] shrink-0 shadow-raised-sm hover:shadow-raised active:shadow-inset-sm"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </Button>
            )}
          </div>

          <div className="text-[#172033] dark:text-[#F8FAFC]">{children}</div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
