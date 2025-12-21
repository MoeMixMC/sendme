/**
 * AmountInput Component
 * =====================
 *
 * Specialized input for ETH amounts.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Only allows numeric input with decimals
 * - Shows ETH suffix
 * - Max button to set entire balance
 * - Insufficient balance warning
 */

import React, { useState, useCallback } from "react";
import { Input } from "../ui";
import { validateAmount, sanitizeAmount, formatBalance } from "../../utils";

interface AmountInputProps {
  /** Current value (as string for precision) */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Available balance for validation */
  maxBalance?: bigint;
  /** Show max button */
  showMaxButton?: boolean;
  /** Disable input */
  disabled?: boolean;
  /** Label text */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * AmountInput - ETH amount entry
 *
 * @example
 * <AmountInput
 *   value={amount}
 *   onChange={setAmount}
 *   maxBalance={balance}
 *   showMaxButton
 * />
 */
export function AmountInput({
  value,
  onChange,
  maxBalance,
  showMaxButton = false,
  disabled = false,
  label,
  className = "",
}: AmountInputProps) {
  const [touched, setTouched] = useState(false);

  // Validate current value
  const validation = validateAmount(value, maxBalance);
  const showError = touched && !validation.isValid && value.length > 0;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeAmount(e.target.value);
      onChange(sanitized);
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
  }, []);

  /**
   * Set to max balance
   *
   * Leaves a small amount for gas (0.001 ETH)
   * This is a UX nicety - users often want to send "all"
   */
  const handleMax = useCallback(() => {
    if (!maxBalance) return;

    // Leave 0.001 ETH for gas
    const gasBuffer = BigInt(1e15); // 0.001 ETH in wei
    const sendable = maxBalance > gasBuffer ? maxBalance - gasBuffer : 0n;
    const formatted = formatBalance(sendable, 6);
    onChange(formatted);
  }, [maxBalance, onChange]);

  return (
    <div className={className}>
      <Input
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="0.00"
        label={label}
        disabled={disabled}
        error={showError ? validation.error : null}
        inputMode="decimal"
        autoComplete="off"
        endIcon={
          <div className="flex items-center gap-2">
            <span className="text-muted">ETH</span>
            {showMaxButton && maxBalance !== undefined && maxBalance > 0n ? (
              <button
                type="button"
                onClick={handleMax}
                className="text-xs text-primary hover:text-primary-hover"
                disabled={disabled}
              >
                MAX
              </button>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
