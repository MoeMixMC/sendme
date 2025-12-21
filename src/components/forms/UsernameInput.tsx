/**
 * UsernameInput Component
 * =======================
 *
 * Specialized input for username entry with live validation.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Auto-sanitizes input (lowercase, alphanumeric only)
 * - Real-time validation feedback
 * - @ prefix for visual context
 * - Character count indicator
 */

import React, { useState, useCallback } from "react";
import { Input } from "../ui";
import { validateUsername, sanitizeUsername } from "../../utils";

interface UsernameInputProps {
  /** Current value */
  value: string;
  /** Called when value changes (already sanitized) */
  onChange: (value: string) => void;
  /** Disable input */
  disabled?: boolean;
  /** Auto focus on mount */
  autoFocus?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * UsernameInput - Username entry with validation
 *
 * @example
 * <UsernameInput
 *   value={username}
 *   onChange={setUsername}
 *   autoFocus
 * />
 */
export function UsernameInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  className = "",
}: UsernameInputProps) {
  const [touched, setTouched] = useState(false);

  // Validate current value
  const validation = validateUsername(value);
  const showError = touched && !validation.isValid && value.length > 0;

  /**
   * Handle input change
   *
   * Sanitizes the input to ensure only valid characters.
   * This provides immediate feedback instead of rejection on submit.
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeUsername(e.target.value);
      // Limit to 20 characters
      const limited = sanitized.slice(0, 20);
      onChange(limited);
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
  }, []);

  return (
    <div className={className}>
      <Input
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="username"
        disabled={disabled}
        autoFocus={autoFocus}
        error={showError ? validation.error : null}
        hint={
          !showError
            ? `${value.length}/20 characters • lowercase letters and numbers only`
            : undefined
        }
        startIcon={<span className="text-muted">@</span>}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );
}
