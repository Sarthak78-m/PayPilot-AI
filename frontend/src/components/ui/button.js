import React from "react";

export function Button({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  icon: Icon,
  iconPosition = "left",
  ...props
}) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E8EDF4] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]";

  const sizeStyles = {
    sm: "text-xs px-3 py-1.5 rounded-lg min-h-[36px] gap-1.5",
    md: "text-sm px-4 py-2 rounded-xl min-h-[44px] gap-2",
    lg: "text-base px-6 py-3 rounded-xl min-h-[48px] gap-2.5",
    icon: "p-2.5 rounded-xl min-w-[44px] min-h-[44px] justify-center",
  };

  const variantStyles = {
    primary:
      "bg-[#2563EB] text-white shadow-primary-glow hover:bg-[#1D4ED8] active:shadow-primary-active active:scale-[0.97]",
    secondary:
      "bg-[#E8EDF4] text-[#172033] shadow-raised-sm hover:shadow-raised active:shadow-inset-sm active:scale-[0.97]",
    outline:
      "bg-transparent text-[#172033] border border-[#CBD5E1] hover:bg-[#E8EDF4] hover:shadow-raised-sm active:shadow-inset-sm active:scale-[0.97]",
    ghost:
      "bg-transparent text-[#172033] hover:bg-[#E8EDF4] hover:shadow-raised-sm active:shadow-inset-sm active:scale-[0.97]",
    destructive:
      "bg-[#DC2626] text-white shadow-[0_4px_14px_rgba(220,38,38,0.35)] hover:bg-[#B91C1C] active:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.3)] active:scale-[0.97]",
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`${baseStyles} ${sizeStyles[size] || sizeStyles.md} ${variantStyles[variant] || variantStyles.secondary} ${className}`}
      {...props}
    >
      {loading ? (
        <svg
          className="animate-spin h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <>
          {Icon && iconPosition === "left" && (
            <span className="shrink-0" aria-hidden="true">
              {typeof Icon === "function" ? <Icon className="h-4 w-4" /> : Icon}
            </span>
          )}
          {children}
          {Icon && iconPosition === "right" && (
            <span className="shrink-0" aria-hidden="true">
              {typeof Icon === "function" ? <Icon className="h-4 w-4" /> : Icon}
            </span>
          )}
        </>
      )}
    </button>
  );
}
