/**
 * Button Component
 * ================
 *
 * A versatile button with variants and loading states.
 *
 * COMPOSITION PATTERN
 * -------------------
 * This component uses composition to allow custom children:
 * - Text: <Button>Click me</Button>
 * - With icon: <Button><Icon /> Click</Button>
 * - Loading: <Button loading>Sending</Button>
 *
 * We spread {...props} to allow standard button attributes
 * like onClick, disabled, type, etc.
 */

import React, { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "./Spinner";
import type { ButtonVariant, ButtonSize } from "../../types";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size variant */
  size?: ButtonSize;
  /** Show loading spinner */
  loading?: boolean;
  /** Full width button */
  fullWidth?: boolean;
  /** Button content */
  children: ReactNode;
}

/**
 * Button - Primary interactive element
 *
 * @example
 * <Button variant="primary" onClick={handleClick}>
 *   Send Transaction
 * </Button>
 *
 * @example
 * <Button variant="secondary" loading>
 *   Creating Account
 * </Button>
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = true,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  // Combine class names based on props
  const classes = [
    "btn",
    `btn-${variant}`,
    size !== "md" ? `btn-${size}` : "",
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <Spinner
          size="sm"
          className="mr-2"
        />
      )}
      {children}
    </button>
  );
}
