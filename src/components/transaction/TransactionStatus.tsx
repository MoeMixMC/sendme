/**
 * TransactionStatus Component
 * ===========================
 *
 * Status badge for transaction state.
 */

import React from "react";
import type { TransactionStatus as TxStatus } from "../../types";

interface TransactionStatusProps {
  /** Transaction status */
  status: TxStatus;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get display text and color for each status
 */
function getStatusDisplay(status: TxStatus) {
  switch (status) {
    case "confirmed":
      return { text: "Confirmed", className: "tx-status-confirmed" };
    case "failed":
      return { text: "Failed", className: "tx-status-failed" };
    case "pending":
    default:
      return { text: "Pending", className: "tx-status-pending" };
  }
}

/**
 * TransactionStatus - Status badge
 *
 * @example
 * <TransactionStatus status="confirmed" />
 */
export function TransactionStatus({
  status,
  className = "",
}: TransactionStatusProps) {
  const display = getStatusDisplay(status);

  return (
    <span className={`tx-status ${display.className} ${className}`}>
      {status === "pending" && (
        <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse mr-1" />
      )}
      {display.text}
    </span>
  );
}
