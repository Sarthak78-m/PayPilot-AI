import React, { useId } from "react";

export function Input({
  label,
  id,
  name,
  type = "text",
  error,
  success,
  helperText,
  disabled = false,
  required = false,
  leadingIcon: LeadingIcon,
  trailingIcon: TrailingIcon,
  isCurrency = false,
  className = "",
  inputClassName = "",
  ...props
}) {
  const generatedId = useId();
  const inputId = id || name || generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText ? `${inputId}-helper` : undefined;

  let stateClasses = "border border-[#D1D8E2] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]";
  if (error) {
    stateClasses = "border-[#DC2626] text-[#DC2626] focus:border-[#DC2626] focus:ring-2 focus:ring-[#DC2626]";
  } else if (success) {
    stateClasses = "border-[#16A34A] focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]";
  }

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-wider text-[#172033] flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-[#DC2626] ml-1" aria-hidden="true">*</span>}
          </span>
        </label>
      )}

      <div className="relative flex items-center">
        {LeadingIcon && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-[#64748B]">
            {typeof LeadingIcon === "function" ? <LeadingIcon className="h-4 w-4" /> : LeadingIcon}
          </div>
        )}

        {isCurrency && !LeadingIcon && (
          <div className="absolute left-3.5 flex items-center pointer-events-none font-semibold text-[#64748B] text-sm">
            $
          </div>
        )}

        <input
          id={inputId}
          name={name}
          type={type}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId || helperId}
          className={`w-full bg-[#E8EDF4] text-[#172033] placeholder-[#94A3B8] text-sm rounded-xl py-2.5 shadow-inset-sm transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:bg-[#DCE3EC] disabled:cursor-not-allowed ${
            LeadingIcon || isCurrency ? "pl-9" : "pl-3.5"
          } ${TrailingIcon ? "pr-9" : "pr-3.5"} ${isCurrency ? "font-mono font-medium tracking-tight" : ""} ${stateClasses} ${inputClassName}`}
          {...props}
        />

        {TrailingIcon && (
          <div className="absolute right-3.5 flex items-center pointer-events-none text-[#64748B]">
            {typeof TrailingIcon === "function" ? <TrailingIcon className="h-4 w-4" /> : TrailingIcon}
          </div>
        )}
      </div>

      {error ? (
        <p id={errorId} className="text-xs text-[#DC2626] font-medium flex items-center gap-1">
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs text-[#64748B]">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
