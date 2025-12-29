/**
 * TransactionList Component
 * =========================
 *
 * Displays transaction history with loading and empty states.
 */

import React from "react";
import { Card, Spinner } from "../ui";
import { TransactionItem } from "./TransactionItem";
import type { Transaction } from "../../types";

interface TransactionListProps {
  /** List of transactions */
  transactions: Transaction[];
  /** Current user's address (to determine sent vs received) */
  userAddress?: string;
  /** Loading state */
  loading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * TransactionList - Transaction history display
 *
 * @example
 * <TransactionList transactions={txHistory} userAddress={account.address} loading={isLoading} />
 */
export function TransactionList({
  transactions,
  userAddress,
  loading = false,
  className = "",
}: TransactionListProps) {
  // Don't render if no transactions and not loading
  if (transactions.length === 0 && !loading) {
    return null;
  }

  /**
   * Determine direction based on sender
   */
  const getDirection = (tx: Transaction): "sent" | "received" => {
    if (!userAddress) return "sent";
    return tx.sender.toLowerCase() === userAddress.toLowerCase() ? "sent" : "received";
  };

  return (
    <div className={`section ${className}`}>
      <h3 className="section-title">Recent Transactions</h3>

      <Card animate="fade-in-up">
        {loading && transactions.length === 0 ? (
          <div className="flex justify-center py-4">
            <Spinner size="md" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-description">No transactions yet</p>
          </div>
        ) : (
          <div>
            {transactions.map((tx, index) => (
              <TransactionItem
                key={tx.userOpHash || index}
                transaction={tx}
                direction={getDirection(tx)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
