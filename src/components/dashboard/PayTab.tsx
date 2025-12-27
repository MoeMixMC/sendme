/**
 * PayTab Component
 * ================
 *
 * Send ETH to another address.
 */

import React from "react";
import { SendForm } from "../forms";
import { Card } from "../ui";
import { BalanceDisplay } from "../account/BalanceDisplay";
import { useAccount, useBalance } from "../../hooks";

interface PayTabProps {
  /** Called when transaction succeeds */
  onTransactionSuccess?: () => void;
}

/**
 * PayTab - Payment/send interface
 */
export function PayTab({ onTransactionSuccess }: PayTabProps) {
  const { account, balance } = useAccount();
  const { refresh: refreshBalance } = useBalance(account?.address ?? null);

  const handleSuccess = () => {
    refreshBalance();
    onTransactionSuccess?.();
  };

  return (
    <div className="pay-tab">
      {/* Available Balance */}
      <Card animate="fade-in-up" className="mb-4">
        <h3 className="card-title">Available Balance</h3>
        <BalanceDisplay balance={balance} />
      </Card>

      {/* Send Form */}
      <SendForm onSuccess={handleSuccess} />
    </div>
  );
}
