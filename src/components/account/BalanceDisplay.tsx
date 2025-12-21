/**
 * BalanceDisplay Component
 * ========================
 *
 * Displays ETH balance with optional animation on change.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Large, prominent number for quick reading
 * - "ETH" suffix for clarity
 * - Optional compact mode for header display
 * - Subtle pulse animation when updating
 */

import React, { useState, useEffect, useRef } from "react";
import { formatBalance } from "../../utils";

interface BalanceDisplayProps {
  /** Balance in wei as bigint */
  balance: bigint;
  /** Compact mode for header */
  compact?: boolean;
  /** Show loading state */
  loading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * BalanceDisplay - ETH balance with formatting
 *
 * @example
 * <BalanceDisplay balance={1000000000000000000n} />
 * // Displays: 1 ETH
 *
 * @example
 * <BalanceDisplay balance={balance} compact />
 * // Compact display for header
 */
export function BalanceDisplay({
  balance,
  compact = false,
  loading = false,
  className = "",
}: BalanceDisplayProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const prevBalance = useRef(balance);

  /**
   * Animate when balance changes
   *
   * We track the previous balance to detect changes.
   * When it changes, we trigger a brief pulse animation
   * to draw attention to the new value.
   */
  useEffect(() => {
    if (prevBalance.current !== balance && prevBalance.current !== 0n) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
    prevBalance.current = balance;
  }, [balance]);

  const formatted = formatBalance(balance);

  const containerClasses = [
    "balance-display",
    compact ? "balance-compact" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const valueClasses = [
    "balance-value",
    isAnimating ? "animate-pulse-subtle" : "",
    loading ? "balance-value-updating" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses}>
      <span className={valueClasses}>{formatted}</span>
      <span className="balance-unit">ETH</span>
    </div>
  );
}
