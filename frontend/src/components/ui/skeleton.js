import React from "react";

export function Skeleton({
  variant = "text",
  width,
  height,
  className = "",
  ...props
}) {
  const variantStyles = {
    text: "h-4 rounded-md w-full",
    circle: "rounded-full aspect-square",
    card: "rounded-2xl p-6 h-36 w-full",
    button: "h-11 rounded-xl w-32",
    input: "h-11 rounded-xl w-full",
  };

  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div
      className={`animate-pulse bg-[#DCE3EC] shadow-inset-sm ${
        variantStyles[variant] || variantStyles.text
      } ${className}`}
      style={style}
      aria-hidden="true"
      {...props}
    />
  );
}
