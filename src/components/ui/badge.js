import React from "react";

export function Badge({
  children,
  variant = "neutral",
  size = "md",
  dot = false,
  className = "",
  ...props
}) {
  const sizeStyles = {
    sm: "text-[11px] px-2 py-0.5 rounded-full font-medium gap-1.5",
    md: "text-xs px-2.5 py-1 rounded-full font-semibold gap-2",
  };

  const variantStyles = {
    success: "bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]",
    warning: "bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]",
    error: "bg-[#FEE2E2] text-[#B91C1C] border border-[#FCA5A5]",
    neutral: "bg-[#E2E8F0] text-[#475569] border border-[#CBD5E1]",
    primary: "bg-[#DBEAFE] text-[#1D4ED8] border border-[#93C5FD]",
  };

  const dotStyles = {
    success: "bg-[#16A34A]",
    warning: "bg-[#F59E0B]",
    error: "bg-[#DC2626]",
    neutral: "bg-[#64748B]",
    primary: "bg-[#2563EB]",
  };

  return (
    <span
      className={`inline-flex items-center shrink-0 tracking-wide select-none ${
        sizeStyles[size] || sizeStyles.md
      } ${variantStyles[variant] || variantStyles.neutral} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            dotStyles[variant] || dotStyles.neutral
          }`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
