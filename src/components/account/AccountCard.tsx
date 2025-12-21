/**
 * AccountCard Component
 * =====================
 *
 * Displays account information: username, address, deployment status.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Username prominently displayed with @ prefix
 * - Copyable address below
 * - Deployment status as subtle badge
 * - Animated entrance for polish
 */

import React from "react";
import { Card } from "../ui";
import { Avatar } from "./Avatar";
import { AddressDisplay } from "./AddressDisplay";
import type { SmartAccount } from "../../types";

interface AccountCardProps {
  /** Account data */
  account: SmartAccount;
  /** Additional CSS classes */
  className?: string;
}

/**
 * AccountCard - Account information display
 *
 * @example
 * <AccountCard account={currentAccount} />
 */
export function AccountCard({ account, className = "" }: AccountCardProps) {
  return (
    <Card className={`animate-fade-in-up ${className}`}>
      <div className="flex items-center gap-3 mb-3">
        <Avatar
          address={account.address}
          name={account.name}
          size="lg"
          showInitials
        />
        <div>
          <h2 className="text-xl font-bold">@{account.name}</h2>
          <AddressDisplay address={account.address} copyable />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            account.deployed
              ? "bg-green-500/20 text-success"
              : "bg-yellow-500/20 text-warning"
          }`}
        >
          {account.deployed ? "Deployed" : "Not deployed"}
        </span>
        {!account.deployed && (
          <span className="text-xs text-dim">
            (Deploys on first transaction)
          </span>
        )}
      </div>
    </Card>
  );
}
