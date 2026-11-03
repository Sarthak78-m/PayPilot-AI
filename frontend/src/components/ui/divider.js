import React from "react";

export function Divider({
  label,
  orientation = "horizontal",
  className = "",
  ...props
}) {
  if (orientation === "vertical") {
    return (
      <div
        className={`divider-groove-v h-full self-stretch my-1 mx-2 shrink-0 ${className}`}
        role="separator"
        aria-orientation="vertical"
        {...props}
      />
    );
  }

  if (label) {
    return (
      <div
        className={`relative flex items-center justify-center w-full my-4 ${className}`}
        role="separator"
        aria-orientation="horizontal"
        {...props}
      >
        <div className="absolute inset-0 flex items-center">
          <div className="w-full divider-groove" />
        </div>
        <span className="relative px-3 bg-[#E8EDF4] text-xs font-semibold uppercase tracking-wider text-[#64748B]">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`divider-groove w-full my-4 shrink-0 ${className}`}
      role="separator"
      aria-orientation="horizontal"
      {...props}
    />
  );
}
