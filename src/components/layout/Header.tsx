/**
 * Header Component
 * ================
 *
 * Fixed top navigation bar with balance and avatar.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Fixed position so it's always visible
 * - Blurred background for glassmorphism effect
 * - Balance on right for quick glance
 * - Avatar on far right for visual identity
 */

import React from "react";
import { useAccount } from "../../hooks";
import { Avatar } from "../account/Avatar";
import { BalanceDisplay } from "../account/BalanceDisplay";

interface HeaderProps {
  /** Optional title override */
  title?: string;
}

/**
 * Header - Top navigation bar
 *
 * Shows app title on left, balance and avatar on right.
 * Only renders when user is logged in.
 *
 * @example
 * <Header /> // Default "Digital Cash" title
 *
 * @example
 * <Header title="Send" />
 */
export function Header({ title = "Digital Cash" }: HeaderProps) {
  const { account, balance, isLoggedIn } = useAccount();

  // Don't render if not logged in
  if (!isLoggedIn || !account) {
    return null;
  }

  return (
    <header className="header">
      <div className="header-left">
        <span className="header-title">{title}</span>
      </div>

      <div className="header-right">
        <BalanceDisplay balance={balance} compact />
        <Avatar address={account.address} size="sm" />
      </div>
    </header>
  );
}
