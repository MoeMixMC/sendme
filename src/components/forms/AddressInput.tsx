/**
 * AddressInput Component
 * ======================
 *
 * Specialized input for Ethereum addresses.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Monospace font for address readability
 * - Real-time format validation
 * - Checksum validation could be added
 */

import React, { useState, useCallback } from "react";
import { Input } from "../ui";
import { validateAddress } from "../../utils";

interface AddressInputProps {
  /** Current value */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Disable input */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * AddressInput - Ethereum address entry
 *
 * @example
 * <AddressInput
 *   value={recipient}
 *   onChange={setRecipient}
 *   label="Recipient"
 * />
 */
export function AddressInput({
  value,
  onChange,
  disabled = false,
  placeholder = "0x...",
  label,
  className = "",
}: AddressInputProps) {
  const [touched, setTouched] = useState(false);

  // Validate current value
  const validation = validateAddress(value);
  const showError = touched && !validation.isValid && value.length > 0;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
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
        placeholder={placeholder}
        label={label}
        disabled={disabled}
        error={showError ? validation.error : null}
        className="font-mono"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );
}
