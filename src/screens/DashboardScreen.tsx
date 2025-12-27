/**
 * DashboardScreen Component
 * =========================
 *
 * Main authenticated view with sidebar navigation and tab content.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Sidebar navigation for Transactions, Profile, Pay
 * - Profile tab is the default (shows avatar + holdings in USD)
 * - Header shows balance and avatar (always visible)
 * - Logout button in sidebar footer
 */

import React, { useEffect } from "react";
import { Header, Sidebar } from "../components/layout";
import { Button } from "../components/ui";
import { ProfileTab, PayTab, TransactionsTab } from "../components/dashboard";
import { useAccount, useBalance, useTransactionHistory } from "../hooks";
import { useUIContext } from "../context";

/** Faucet URL for getting testnet ETH */
const FAUCET_URL = "https://www.alchemy.com/faucets/base-sepolia";

/**
 * DashboardScreen - Main authenticated view
 */
export function DashboardScreen() {
  const { goToWelcome, dashboardTab } = useUIContext();
  const {
    account,
    isLoggedIn,
    logout: contextLogout,
    setBalance,
  } = useAccount();

  // Fetch balance with polling
  const { balance, refresh: refreshBalance } = useBalance(
    account?.address ?? null
  );

  // Fetch transaction history with polling
  const { refresh: refreshHistory } = useTransactionHistory(
    account?.address ?? null
  );

  // Sync balance to context
  useEffect(() => {
    if (balance !== undefined) {
      setBalance(balance);
    }
  }, [balance, setBalance]);

  /**
   * Handle logout
   */
  const handleLogout = () => {
    contextLogout();
    goToWelcome();
  };

  /**
   * Handle successful transaction
   */
  const handleTransactionSuccess = () => {
    refreshBalance();
    refreshHistory();
  };

  // Redirect if not logged in
  if (!isLoggedIn || !account) {
    return null;
  }

  /**
   * Render the active tab content
   */
  const renderTabContent = () => {
    switch (dashboardTab) {
      case "profile":
        return <ProfileTab />;
      case "transactions":
        return <TransactionsTab />;
      case "pay":
        return <PayTab onTransactionSuccess={handleTransactionSuccess} />;
      default:
        return <ProfileTab />;
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <div className="dashboard-main">
        <Header />

        <div className="dashboard-content">
          {renderTabContent()}

          {/* Faucet Link */}
          <div className="section text-center mt-6">
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
          <div className="section mt-4 mb-8">
            <Button variant="tertiary" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
