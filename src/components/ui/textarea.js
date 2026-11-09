import React, { useId } from "react";

export function Textarea({
  label,
  id,
  name,
  error,
  helperText,
  disabled = false,
  required = false,
  rows = 3,
  maxLength,
  value,
  className = "",
  textareaClassName = "",
  ...props
}) {
  const generatedId = useId();
  const textareaId = id || name || generatedId;
  const errorId = error ? `${textareaId}-error` : undefined;
  const helperId = helperText ? `${textareaId}-helper` : undefined;

  let stateClasses = "border border-[#D1D8E2] dark:border-[#1E293B] focus:border-[#2563EB] dark:focus:border-[#3B82F6] focus:ring-2 focus:ring-[#2563EB] dark:focus:ring-[#3B82F6]";
  if (error) {
    stateClasses = "border-[#DC2626] dark:border-[#EF4444] text-[#DC2626] dark:text-[#EF4444] focus:border-[#DC2626] dark:focus:border-[#EF4444] focus:ring-2 focus:ring-[#DC2626]";
  }

  const currentLength = typeof value === "string" ? value.length : 0;

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-xs font-semibold uppercase tracking-wider text-[#172033] dark:text-[#F8FAFC]"
          >
            {label}
            {required && <span className="text-[#DC2626] dark:text-[#EF4444] ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        {maxLength && (
          <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
            {currentLength}/{maxLength}
          </span>
        )}
      </div>

      <textarea
        id={textareaId}
        name={name}
        rows={rows}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId || helperId}
        className={`w-full bg-[#E8EDF4] dark:bg-[#0D121D] text-[#172033] dark:text-[#F8FAFC] placeholder-[#94A3B8] dark:placeholder-[#64748B] text-sm rounded-xl p-3.5 shadow-inset-sm transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:bg-[#DCE3EC] dark:disabled:bg-[#141C2E] disabled:cursor-not-allowed resize-y ${stateClasses} ${textareaClassName}`}
        {...props}
      />

      {error ? (
        <p id={errorId} className="text-xs text-[#DC2626] dark:text-[#EF4444] font-medium flex items-center gap-1">
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
        <p id={helperId} className="text-xs text-[#64748B] dark:text-[#94A3B8]">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
