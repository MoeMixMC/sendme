/**
 * Input Component
 * ===============
 *
 * A styled text input with label, hint, and error states.
 *
 * CONTROLLED VS UNCONTROLLED
 * --------------------------
 * This component works as both:
 * - Controlled: Pass value and onChange
 * - Uncontrolled: Use ref and defaultValue
 *
 * For forms, controlled is usually preferred because
 * React owns the state and validation is easier.
 */

import React, {
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
} from "react";
import type { InputVariant } from "../../types";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label shown above input */
  label?: string;
  /** Hint text shown below input */
  hint?: string;
  /** Error message (shows in red) */
  error?: string | null;
  /** Visual variant (auto-set based on error) */
  variant?: InputVariant;
  /** Icon to show at start of input */
  startIcon?: ReactNode;
  /** Icon to show at end of input */
  endIcon?: ReactNode;
}

/**
 * Input - Text input with validation states
 *
 * WHY FORWARDREF?
 * ---------------
 * forwardRef allows parent components to get a reference
 * to the underlying <input> element. This is useful for:
 * - Focusing the input programmatically
 * - Integrating with form libraries
 * - Reading values without controlled state
 *
 * @example
 * <Input
 *   label="Username"
 *   placeholder="Enter username"
 *   value={username}
 *   onChange={(e) => setUsername(e.target.value)}
 *   error={usernameError}
 * />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      variant,
      startIcon,
      endIcon,
      className = "",
      ...props
    },
    ref
  ) => {
    // Determine variant based on error state
    const effectiveVariant = error ? "error" : variant || "default";

    const inputClasses = [
      "input",
      effectiveVariant === "error" ? "input-error" : "",
      effectiveVariant === "success" ? "input-success" : "",
      startIcon ? "pl-10" : "",
      endIcon ? "pr-10" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className="input-wrapper">
        {label && <label className="input-label">{label}</label>}

        <div className="relative">
          {startIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              {startIcon}
            </div>
          )}

          <input ref={ref} className={inputClasses} {...props} />

          {endIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
              {endIcon}
            </div>
          )}
        </div>

        {error && <p className="input-error-text">{error}</p>}
        {hint && !error && <p className="input-hint">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
