import React from "react";
import { Button } from "./button";

export function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  actionHref,
  children,
  className = "",
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-[#E8EDF4] rounded-3xl shadow-raised border border-white/60 max-w-lg mx-auto ${className}`}
    >
      <div className="w-16 h-16 rounded-2xl bg-[#E8EDF4] shadow-inset-sm flex items-center justify-center text-[#2563EB] mb-5">
        {Icon ? (
          typeof Icon === "function" ? <Icon className="w-8 h-8" /> : Icon
        ) : (
          <svg
            className="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        )}
      </div>

      <h3 className="text-lg font-bold text-[#172033] tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-[#64748B] max-w-sm mt-1.5 mb-6 leading-relaxed">
          {description}
        </p>
      )}

      {actionLabel && (onAction || actionHref) && (
        actionHref ? (
          <a href={actionHref}>
            <Button variant="primary">{actionLabel}</Button>
          </a>
        ) : (
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      )}

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
