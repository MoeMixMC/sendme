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
  /** Loading state */
  loading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * TransactionList - Transaction history display
 *
 * @example
 * <TransactionList transactions={txHistory} loading={isLoading} />
 */
export function TransactionList({
  transactions,
  loading = false,
  className = "",
}: TransactionListProps) {
  // Don't render if no transactions and not loading
  if (transactions.length === 0 && !loading) {
    return null;
  }

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
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
