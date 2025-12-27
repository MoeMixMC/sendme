/**
 * ProfileTab Component
 * ====================
 *
 * Shows user profile with avatar and holdings in USD.
 */

import React from "react";
import { Card } from "../ui";
import { Avatar } from "../account/Avatar";
import { AddressDisplay } from "../account/AddressDisplay";
import { useAccount } from "../../hooks";
import { formatBalance } from "../../utils";

/** Approximate ETH price in USD (can be fetched from API later) */
const ETH_PRICE_USD = 3500;

/**
 * Convert wei balance to USD string
 */
function formatBalanceUSD(balance: bigint): string {
  // Convert wei to ETH (1 ETH = 10^18 wei)
  const ethValue = Number(balance) / 1e18;
  const usdValue = ethValue * ETH_PRICE_USD;

  // Format with 2 decimal places and commas
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usdValue);
}

/**
 * ProfileTab - User profile display
 */
export function ProfileTab() {
  const { account, balance } = useAccount();

  if (!account) {
    return null;
  }

  const formattedETH = formatBalance(balance);
  const formattedUSD = formatBalanceUSD(balance);

  return (
    <div className="profile-tab">
      {/* Profile Card */}
      <Card animate="fade-in-up" className="profile-card">
        <div className="profile-header">
          <Avatar
            address={account.address}
            name={account.name}
            size="xl"
            showInitials
          />
          <h2 className="profile-name">@{account.name}</h2>
          <AddressDisplay address={account.address} full copyable />
        </div>
      </Card>

      {/* Holdings Card */}
      <Card animate="fade-in-up" className="mt-4">
        <h3 className="card-title">Total Holdings</h3>
        <div className="holdings-value">{formattedUSD}</div>
        <p className="holdings-eth">{formattedETH} ETH</p>
      </Card>
    </div>
  );
}
