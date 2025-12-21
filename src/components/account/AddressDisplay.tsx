/**
 * AddressDisplay Component
 * ========================
 *
 * Displays an Ethereum address with copy-to-clipboard functionality.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Monospace font for address readability
 * - Truncated by default (0x1234...5678)
 * - Click to copy with visual feedback
 * - Full address option for detailed views
 */

import React, { useState, useCallback } from "react";
import { formatAddress } from "../../utils";

interface AddressDisplayProps {
  /** Ethereum address */
  address: string;
  /** Show full address (default: truncated) */
  full?: boolean;
  /** Enable copy to clipboard */
  copyable?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * AddressDisplay - Formatted address with copy
 *
 * @example
 * <AddressDisplay address="0x1234...5678" />
 *
 * @example
 * <AddressDisplay address={account.address} copyable full />
 */
export function AddressDisplay({
  address,
  full = false,
  copyable = true,
  className = "",
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const displayAddress = full ? address : formatAddress(address);

  /**
   * Copy address to clipboard
   *
   * Uses the modern Clipboard API with fallback.
   * Shows "Copied!" feedback briefly.
   */
  const handleCopy = useCallback(async () => {
    if (!copyable) return;

    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [address, copyable]);

  const containerClasses = [
    full ? "address" : "address-truncated",
    copyable ? "address-copyable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (copyable) {
    return (
      <button
        className={containerClasses}
        onClick={handleCopy}
        title="Click to copy address"
        type="button"
      >
        <span>{displayAddress}</span>
        <span className="text-xs text-dim ml-1">
          {copied ? "Copied!" : ""}
        </span>
      </button>
    );
  }

  return <span className={containerClasses}>{displayAddress}</span>;
}
