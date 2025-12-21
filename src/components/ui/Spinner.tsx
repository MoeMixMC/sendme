/**
 * Spinner Component
 * =================
 *
 * A CSS-animated loading spinner.
 *
 * Uses CSS animation instead of SVG or canvas for:
 * - Simplicity
 * - Performance
 * - Accessibility (respects prefers-reduced-motion)
 */

import React from "react";

type SpinnerSize = "sm" | "md" | "lg";

interface SpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Additional CSS classes */
  className?: string;
  /** Color (inherits currentColor by default) */
  color?: string;
}

/**
 * Spinner - Loading indicator
 *
 * @example
 * <Spinner /> // Default medium size
 *
 * @example
 * <Spinner size="lg" className="text-primary" />
 */
export function Spinner({
  size = "md",
  className = "",
  color,
}: SpinnerProps) {
  const classes = ["spinner", `spinner-${size}`, className]
    .filter(Boolean)
    .join(" ");

  const style = color ? { borderTopColor: color } : undefined;

  return (
    <div
      className={classes}
      style={style}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}
