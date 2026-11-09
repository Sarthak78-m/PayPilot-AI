import React, { useId } from "react";

export function Checkbox({
  label,
  description,
  id,
  name,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  error,
  className = "",
  ...props
}) {
  const generatedId = useId();
  const checkboxId = id || name || generatedId;

  return (
    <div className={`flex items-start gap-3 select-none ${className}`}>
      <div className="relative flex items-center justify-center shrink-0 mt-0.5">
        <input
          id={checkboxId}
          name={name}
          type="checkbox"
          checked={checked}
          defaultChecked={defaultChecked}
          onChange={onChange}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className="peer sr-only"
          {...props}
        />
        <label
          htmlFor={checkboxId}
          className="w-5 h-5 rounded-md bg-[#E8EDF4] dark:bg-[#0D121D] border border-[#D1D8E2] dark:border-[#1E293B] shadow-inset-sm flex items-center justify-center cursor-pointer transition-all duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-[#2563EB] dark:focus-visible:ring-[#3B82F6] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#E8EDF4] dark:peer-focus-visible:ring-offset-[#0A0D14] peer-checked:bg-[#2563EB] dark:peer-checked:bg-[#3B82F6] peer-checked:border-[#2563EB] dark:peer-checked:border-[#3B82F6] peer-checked:shadow-primary-glow peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
        >
          <svg
            className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-150 stroke-[3]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </label>
      </div>

      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <label
              htmlFor={checkboxId}
              className={`text-sm font-medium cursor-pointer ${
                disabled ? "text-[#94A3B8] dark:text-[#64748B] cursor-not-allowed" : "text-[#172033] dark:text-[#F8FAFC]"
              }`}
            >
              {label}
            </label>
          )}
          {description && (
            <span className={`text-xs ${disabled ? "text-[#CBD5E1] dark:text-[#475569]" : "text-[#64748B] dark:text-[#94A3B8]"}`}>
              {description}
            </span>
          )}
          {error && <span className="text-xs text-[#DC2626] dark:text-[#EF4444] font-medium mt-0.5">{error}</span>}
        </div>
      )}
    </div>
  );
}
