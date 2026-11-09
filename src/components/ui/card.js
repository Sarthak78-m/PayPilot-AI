import React from "react";

export function Card({
  children,
  variant = "raised",
  className = "",
  as: Component = "div",
  ...props
}) {
  const variantStyles = {
    raised: "bg-[#E8EDF4] dark:bg-[#111726] shadow-raised rounded-2xl border border-white/80 dark:border-white/10",
    "raised-sm": "bg-[#E8EDF4] dark:bg-[#111726] shadow-raised-sm rounded-xl border border-white/80 dark:border-white/10",
    "raised-lg": "bg-[#E8EDF4] dark:bg-[#111726] shadow-raised-lg rounded-3xl border border-white/80 dark:border-white/10",
    inset: "bg-[#E8EDF4] dark:bg-[#0D121D] shadow-inset rounded-2xl border border-[#CBD5E1]/60 dark:border-white/10",
    "inset-sm": "bg-[#E8EDF4] dark:bg-[#0D121D] shadow-inset-sm rounded-xl border border-[#CBD5E1]/60 dark:border-white/10",
    flat: "bg-[#E8EDF4] dark:bg-[#111726] rounded-2xl border border-[#CBD5E1] dark:border-white/10",
    interactive:
      "bg-[#E8EDF4] dark:bg-[#111726] shadow-raised hover:shadow-raised-lg active:shadow-inset-sm rounded-2xl border border-white/80 dark:border-white/10 cursor-pointer transition-all duration-200",
  };

  return (
    <Component
      className={`p-4 sm:p-5 text-[#172033] dark:text-[#F8FAFC] ${variantStyles[variant] || variantStyles.raised} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ children, className = "", ...props }) {
  return (
    <div className={`flex flex-col gap-1 mb-3 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "", as: Component = "h3", ...props }) {
  return (
    <Component className={`text-base sm:text-lg font-bold text-[#172033] dark:text-[#F8FAFC] tracking-tight ${className}`} {...props}>
      {children}
    </Component>
  );
}

export function CardDescription({ children, className = "", ...props }) {
  return (
    <p className={`text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ children, className = "", ...props }) {
  return (
    <div className={`space-y-3.5 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = "", ...props }) {
  return (
    <div
      className={`flex items-center justify-between pt-3.5 mt-3.5 border-t border-[#CBD5E1]/60 dark:border-white/10 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
