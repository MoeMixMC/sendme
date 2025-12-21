/**
 * DashboardScreen Component
 * =========================
 *
 * Main authenticated view with account info, balance, send form, and history.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Header shows balance and avatar (always visible)
 * - Account card with address and status
 * - Large balance display
 * - Send form below balance
 * - Transaction history
 * - Faucet link for testnet
 * - Logout at bottom
 */

import React, { useEffect } from "react";
import { Header, Container } from "../components/layout";
import { Card, Button } from "../components/ui";
import { AccountCard, BalanceDisplay } from "../components/account";
import { SendForm } from "../components/forms";
import { TransactionList } from "../components/transaction";
import { useAccount, useBalance, useTransactionHistory } from "../hooks";
import { useUIContext } from "../context";

/** Faucet URL for getting testnet ETH */
const FAUCET_URL = "https://www.alchemy.com/faucets/base-sepolia";

/**
 * DashboardScreen - Main authenticated view
 */
export function DashboardScreen() {
  const { goToWelcome } = useUIContext();
  const {
    account,
    isLoggedIn,
    logout: contextLogout,
    setBalance,
    markDeployed,
  } = useAccount();

  // Fetch balance with polling
  const { balance, isLoading: balanceLoading, refresh: refreshBalance } = useBalance(
    account?.address ?? null
  );

  // Fetch transaction history with polling
  const { transactions, isLoading: historyLoading, refresh: refreshHistory } =
    useTransactionHistory(account?.address ?? null);

  // Sync balance to context
  useEffect(() => {
    if (balance !== undefined) {
      setBalance(balance);
    }
  }, [balance, setBalance]);

  /**
   * Handle logout
   *
   * Clears context and navigates to welcome screen.
   */
  const handleLogout = () => {
    contextLogout();
    goToWelcome();
  };

  /**
   * Handle successful transaction
   *
   * Refreshes balance and history.
   */
  const handleTransactionSuccess = () => {
    refreshBalance();
    refreshHistory();
  };

  // Redirect if not logged in
  if (!isLoggedIn || !account) {
    return null;
  }

  return (
    <>
      <Header />

      <Container withHeader>
        {/* Account Card */}
        <AccountCard account={account} className="mb-4" />

        {/* Balance Card */}
        <Card animate="fade-in-up" className="mb-4">
          <h2 className="card-title">Balance</h2>
          <p className="card-subtitle mb-2">Base Sepolia Testnet</p>
          <BalanceDisplay balance={balance} loading={balanceLoading} />
        </Card>

        {/* Send Form */}
        <SendForm onSuccess={handleTransactionSuccess} />

        {/* Transaction History */}
        <TransactionList
          transactions={transactions}
          loading={historyLoading}
        />

        {/* Faucet Link */}
        <div className="section text-center">
          <p className="text-sm text-muted">
            Need testnet ETH?{" "}
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Get from faucet
            </a>
          </p>
        </div>

        {/* Logout */}
        <div className="section mt-6 mb-8">
          <Button variant="tertiary" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </Container>
    </>
  );
}
