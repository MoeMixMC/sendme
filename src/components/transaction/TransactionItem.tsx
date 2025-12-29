/**
 * TransactionItem Component
 * =========================
 *
 * Single transaction row in history list.
 * Shows username with shortened address underneath.
 */

import React from "react";
import type { Transaction } from "../../types";
import { formatAddress, formatTimestamp } from "../../utils";
import { TransactionStatus } from "./TransactionStatus";
import { Avatar } from "../account";
import { config } from "../../config";

interface TransactionItemProps {
  /** Transaction data */
  transaction: Transaction;
  /** Direction of the transaction */
  direction: "sent" | "received";
  /** Additional CSS classes */
  className?: string;
}

/** Base Sepolia block explorer */
const EXPLORER_URL = config.explorerUrl;

/**
 * Normalize amount to consistent format (e.g., 0.001 not .001)
 */
function formatAmount(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  // Remove trailing zeros but keep at least 3 decimal places for small amounts
  if (num < 1 && num > 0) {
    // For small amounts, show enough decimals to be meaningful
    const formatted = num.toFixed(6).replace(/\.?0+$/, "");
    // Ensure at least one digit after decimal
    return formatted.includes(".") ? formatted : formatted + ".0";
  }

  // For larger amounts, show up to 4 decimals
  return num.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * TransactionItem - Single transaction row
 *
 * @example
 * <TransactionItem transaction={tx} direction="sent" />
 */
export function TransactionItem({
  transaction,
  direction,
  className = "",
}: TransactionItemProps) {
  const { sender, senderName, toAddress, toName, value, status, txHash, createdAt } = transaction;

  // Show recipient for sent, sender for received
  const counterpartyAddress = direction === "sent" ? toAddress : sender;
  const counterpartyName = direction === "sent" ? toName : senderName;
  const amountClass = direction === "sent" ? "tx-amount-sent" : "tx-amount-received";
  const amountPrefix = direction === "sent" ? "-" : "+";
  const formattedValue = formatAmount(value);

  return (
    <div className={`tx-card ${className}`}>
      <div className="tx-card-main">
        <Avatar
          address={counterpartyAddress}
          name={counterpartyName || undefined}
          size="md"
        />

        <div className="tx-card-details">
          <div className="tx-card-primary">
            {counterpartyName ? (
              <span className="tx-card-username">{counterpartyName}</span>
            ) : (
              <span className="tx-card-username">{formatAddress(counterpartyAddress)}</span>
            )}
            <span className={`tx-card-amount ${amountClass}`}>
              {amountPrefix}{formattedValue} ETH
            </span>
          </div>

          <div className="tx-card-secondary">
            {counterpartyName && (
              <span className="tx-card-address">{formatAddress(counterpartyAddress)}</span>
            )}
            <span className="tx-card-time">{formatTimestamp(createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="tx-card-footer">
        <TransactionStatus status={status} />
        {txHash && (
          <a
            href={`${EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tx-card-link"
          >
            View on Explorer →
          </a>
        )}
      </div>
    </div>
  );
}
