"use client";

import React, { useState } from "react";

export function Tooltip({
  content,
  children,
  position = "top",
  delay = 200,
  className = "",
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState(null);

  const showTooltip = () => {
    const id = setTimeout(() => setIsVisible(true), delay);
    setTimeoutId(id);
  };

  const hideTooltip = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  const positionStyles = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={`absolute z-50 whitespace-nowrap px-2.5 py-1 text-xs font-medium text-white bg-[#172033] shadow-raised-sm rounded-lg pointer-events-none transition-opacity duration-150 ${
            positionStyles[position] || positionStyles.top
          }`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
