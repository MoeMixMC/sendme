/**
 * TransactionsTab Component
 * =========================
 *
 * Shows transaction history.
 */

import React from "react";
import { Card, Spinner } from "../ui";
import { TransactionList } from "../transaction";
import { useAccount, useTransactionHistory } from "../../hooks";

/**
 * TransactionsTab - Transaction history display
 */
export function TransactionsTab() {
  const { account } = useAccount();
  const { transactions, isLoading } = useTransactionHistory(
    account?.address ?? null
  );

  return (
    <div className="transactions-tab">
      <h2 className="section-title">Transaction History</h2>

      {isLoading && transactions.length === 0 ? (
        <Card animate="fade-in-up">
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        </Card>
      ) : transactions.length === 0 ? (
        <Card animate="fade-in-up">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-title">No transactions yet</p>
            <p className="empty-state-description">
              Your transaction history will appear here
            </p>
          </div>
        </Card>
      ) : (
        <TransactionList transactions={transactions} loading={isLoading} />
      )}
    </div>
  );
}
