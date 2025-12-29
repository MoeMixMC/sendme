/**
 * TransactionsTab Component
 * =========================
 *
 * Shows transaction history split into Sent and Received sections.
 */

import React, { useMemo } from "react";
import { Card, Spinner } from "../ui";
import { TransactionItem } from "../transaction";
import { useAccount, useTransactionHistory } from "../../hooks";

/**
 * TransactionsTab - Transaction history display
 */
export function TransactionsTab() {
  const { account } = useAccount();
  const { transactions, isLoading } = useTransactionHistory(
    account?.address ?? null
  );

  // Split transactions into sent and received
  const { sent, received } = useMemo(() => {
    const userAddress = account?.address?.toLowerCase();
    if (!userAddress) return { sent: [], received: [] };

    return transactions.reduce(
      (acc, tx) => {
        if (tx.sender.toLowerCase() === userAddress) {
          acc.sent.push(tx);
        } else {
          acc.received.push(tx);
        }
        return acc;
      },
      { sent: [] as typeof transactions, received: [] as typeof transactions }
    );
  }, [transactions, account?.address]);

  if (isLoading && transactions.length === 0) {
    return (
      <div className="transactions-tab">
        <Card animate="fade-in-up">
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        </Card>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="transactions-tab">
        <Card animate="fade-in-up">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-title">No transactions yet</p>
            <p className="empty-state-description">
              Your transaction history will appear here
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="transactions-tab">
      {/* Sent Transactions */}
      <div className="tx-section">
        <h3 className="tx-section-title">
          <span className="tx-section-icon">↑</span>
          Sent
        </h3>
        {sent.length === 0 ? (
          <Card animate="fade-in-up">
            <p className="text-muted text-sm text-center py-4">No sent transactions</p>
          </Card>
        ) : (
          <Card animate="fade-in-up">
            {sent.map((tx, index) => (
              <TransactionItem
                key={tx.userOpHash || index}
                transaction={tx}
                direction="sent"
              />
            ))}
          </Card>
        )}
      </div>

      {/* Received Transactions */}
      <div className="tx-section">
        <h3 className="tx-section-title">
          <span className="tx-section-icon">↓</span>
          Received
        </h3>
        {received.length === 0 ? (
          <Card animate="fade-in-up">
            <p className="text-muted text-sm text-center py-4">No received transactions</p>
          </Card>
        ) : (
          <Card animate="fade-in-up">
            {received.map((tx, index) => (
              <TransactionItem
                key={tx.userOpHash || index}
                transaction={tx}
                direction="received"
              />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
