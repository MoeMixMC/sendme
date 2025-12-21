/**
 * SendForm Component
 * ==================
 *
 * Complete form for sending ETH transactions.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Uses useSendTransaction hook for state machine
 * - Shows progress through each stage
 * - Clears form on success
 * - Status message for each state
 */

import React, { useState, useCallback, useEffect } from "react";
import { Card, Button, StatusMessage } from "../ui";
import { AddressInput } from "./AddressInput";
import { AmountInput } from "./AmountInput";
import { useSendTransaction, useAccount } from "../../hooks";

interface SendFormProps {
  /** Called when transaction succeeds */
  onSuccess?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SendForm - ETH send transaction form
 *
 * @example
 * <SendForm onSuccess={() => refreshBalance()} />
 */
export function SendForm({ onSuccess, className = "" }: SendFormProps) {
  const { account, balance, markDeployed, refreshBalance } = useAccount();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const { state, send, reset, isSending, statusMessage } = useSendTransaction(
    account?.address ?? null,
    account?.credentialId ?? null,
    {
      onSuccess: (txHash) => {
        // Clear form on success
        setRecipient("");
        setAmount("");
        // Refresh balance
        refreshBalance();
        // Mark as deployed if first tx
        if (account && !account.deployed) {
          markDeployed();
        }
        // Notify parent
        onSuccess?.();
      },
    }
  );

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!recipient || !amount) return;
      await send(recipient, amount);
    },
    [recipient, amount, send]
  );

  /**
   * Reset error state when user starts typing again
   */
  useEffect(() => {
    if (state.status === "error") {
      // Reset on next input change
      const timeout = setTimeout(reset, 5000);
      return () => clearTimeout(timeout);
    }
  }, [state.status, reset]);

  const isSubmitDisabled = isSending || !recipient || !amount;

  // Determine button text based on state
  const getButtonText = () => {
    switch (state.status) {
      case "validating":
        return "Validating...";
      case "preparing":
        return "Preparing...";
      case "signing":
        return "Confirm in passkey...";
      case "submitting":
        return "Submitting...";
      case "confirming":
        return "Confirming...";
      default:
        return "Send";
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <Card animate="fade-in-up" className="mb-4">
        <h3 className="section-title mb-4">Send ETH</h3>

        <div className="space-y-4">
          <AddressInput
            value={recipient}
            onChange={setRecipient}
            placeholder="Recipient address (0x...)"
            disabled={isSending}
          />

          <AmountInput
            value={amount}
            onChange={setAmount}
            maxBalance={balance}
            showMaxButton
            disabled={isSending}
          />

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitDisabled}
            loading={isSending}
          >
            {getButtonText()}
          </Button>
        </div>
      </Card>

      {/* Status message */}
      {statusMessage && state.status !== "idle" && (
        <StatusMessage
          type={state.status === "error" ? "error" : state.status === "success" ? "success" : "info"}
          message={statusMessage}
          onDismiss={state.status === "error" || state.status === "success" ? reset : undefined}
          className="mt-4"
        />
      )}
    </form>
  );
}
