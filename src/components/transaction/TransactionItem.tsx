/**
 * TransactionItem Component
 * =========================
 *
 * Single transaction row in history list.
 */

import React from "react";
import type { Transaction } from "../../types";
import { formatAddress } from "../../utils";
import { TransactionStatus } from "./TransactionStatus";

interface TransactionItemProps {
  /** Transaction data */
  transaction: Transaction;
  /** Additional CSS classes */
  className?: string;
}

/** Base Sepolia block explorer */
const EXPLORER_URL = "https://sepolia.basescan.org";

/**
 * TransactionItem - Single transaction row
 *
 * @example
 * <TransactionItem transaction={tx} />
 */
export function TransactionItem({
  transaction,
  className = "",
}: TransactionItemProps) {
  const { toAddress, value, status, txHash } = transaction;

  return (
    <div className={`tx-item ${className}`}>
      <div className="tx-item-row">
        <span className="tx-item-address">
          To: {formatAddress(toAddress)}
        </span>
        <span className="tx-item-amount">{value} ETH</span>
      </div>

      <div className="tx-item-meta">
        <TransactionStatus status={status} />
        {txHash && (
          <a
            href={`${EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="link text-xs"
          >
            View on Explorer
          </a>
        )}
      </div>
    </div>
  );
}
