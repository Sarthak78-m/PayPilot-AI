import React, { useId } from "react";

export function Select({
  label,
  id,
  name,
  options = [],
  children,
  error,
  helperText,
  disabled = false,
  required = false,
  className = "",
  selectClassName = "",
  ...props
}) {
  const generatedId = useId();
  const selectId = id || name || generatedId;
  const errorId = error ? `${selectId}-error` : undefined;
  const helperId = helperText ? `${selectId}-helper` : undefined;

  let stateClasses = "border border-[#D1D8E2] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]";
  if (error) {
    stateClasses = "border-[#DC2626] text-[#DC2626] focus:border-[#DC2626] focus:ring-2 focus:ring-[#DC2626]";
  }

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-semibold uppercase tracking-wider text-[#172033]"
        >
          {label}
          {required && <span className="text-[#DC2626] ml-1" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <select
          id={selectId}
          name={name}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId || helperId}
          className={`w-full appearance-none bg-[#E8EDF4] text-[#172033] text-sm rounded-xl py-2.5 pl-3.5 pr-10 shadow-inset-sm transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:bg-[#DCE3EC] disabled:cursor-not-allowed cursor-pointer ${stateClasses} ${selectClassName}`}
          {...props}
        >
          {children ||
            options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
        </select>

        <div className="absolute right-3.5 flex items-center pointer-events-none text-[#64748B]">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
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
