/**
 * useSendTransaction - Transaction State Machine Hook
 * =====================================================
 *
 * STATE MACHINE PATTERN
 * ---------------------
 * Sending a transaction has multiple distinct phases:
 * 1. idle - Form ready for input
 * 2. validating - Checking inputs
 * 3. preparing - Building UserOp on backend
 * 4. signing - Waiting for passkey confirmation
 * 5. submitting - Sending to bundler
 * 6. confirming - Waiting for on-chain inclusion
 * 7. success - Transaction confirmed
 * 8. error - Something went wrong
 *
 * Using a state machine makes "impossible states impossible":
 * - Can't have a txHash without being in 'success' status
 * - Can't have an error message without being in 'error' status
 * - TypeScript enforces correct handling of each state
 *
 * This pattern is called "making illegal states unrepresentable"
 */

import { useState, useCallback } from "react";
import type { Address, Hex } from "viem";
import { trpc } from "../trpc";
import { signUserOp, type UserOperation } from "../account/userOp";
import type { SendState } from "../types";
import { validateAddress, validateAmount } from "../utils";

interface UseSendTransactionOptions {
  /** Called when transaction is confirmed */
  onSuccess?: (txHash: string) => void;
  /** Called when transaction fails */
  onError?: (error: string) => void;
}

interface UseSendTransactionReturn {
  /** Current state of the send flow */
  state: SendState;
  /** Initiate a send transaction */
  send: (to: string, amount: string) => Promise<void>;
  /** Reset to idle state */
  reset: () => void;
  /** Whether currently in a sending state */
  isSending: boolean;
  /** Get status message for current state */
  statusMessage: string | null;
}

/**
 * Get a user-friendly status message for each state
 */
function getStatusMessage(state: SendState): string | null {
  switch (state.status) {
    case "idle":
      return null;
    case "validating":
      return "Validating...";
    case "preparing":
      return "Preparing transaction...";
    case "signing":
      return "Confirm with your passkey...";
    case "submitting":
      return "Submitting transaction...";
    case "confirming":
      return "Waiting for confirmation...";
    case "success":
      return `Transaction confirmed!`;
    case "error":
      return state.message;
    default:
      return null;
  }
}

/**
 * useSendTransaction - Manage the full send transaction flow
 *
 * @param senderAddress - The sender's smart account address
 * @param credentialId - The passkey credential ID for signing
 * @param options - Callbacks for success/error
 */
export function useSendTransaction(
  senderAddress: string | null,
  credentialId: string | null,
  options: UseSendTransactionOptions = {}
): UseSendTransactionReturn {
  const { onSuccess, onError } = options;

  const [state, setState] = useState<SendState>({ status: "idle" });

  /**
   * Reset to idle state
   */
  const reset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  /**
   * Send transaction - the main flow
   *
   * This orchestrates the entire send process:
   * 1. Validate inputs
   * 2. Prepare UserOp (backend)
   * 3. Sign with passkey (frontend)
   * 4. Submit to bundler (backend)
   * 5. Wait for confirmation (backend)
   */
  const send = useCallback(
    async (to: string, amount: string) => {
      if (!senderAddress || !credentialId) {
        setState({ status: "error", message: "Not logged in" });
        return;
      }

      try {
        // ----------------------------------------
        // Step 1: Validate inputs
        // ----------------------------------------
        setState({ status: "validating" });

        const addressValidation = validateAddress(to);
        if (!addressValidation.isValid) {
          throw new Error(addressValidation.error || "Invalid address");
        }

        const amountValidation = validateAmount(amount);
        if (!amountValidation.isValid) {
          throw new Error(amountValidation.error || "Invalid amount");
        }

        // ----------------------------------------
        // Step 2: Prepare UserOp
        // ----------------------------------------
        setState({ status: "preparing" });

        const prepared = await trpc.prepareUserOp.mutate({
          sender: senderAddress,
          to,
          value: amount,
        });

        // ----------------------------------------
        // Step 3: Sign with passkey
        // ----------------------------------------
        setState({ status: "signing" });

        // Convert prepared UserOp to internal format for signing
        const userOp: UserOperation = {
          sender: prepared.userOp.sender as Address,
          nonce: BigInt(prepared.userOp.nonce),
          factory: prepared.userOp.factory as Address | null,
          factoryData: prepared.userOp.factoryData as Hex | null,
          callData: prepared.userOp.callData as Hex,
          callGasLimit: BigInt(prepared.userOp.callGasLimit),
          verificationGasLimit: BigInt(prepared.userOp.verificationGasLimit),
          preVerificationGas: BigInt(prepared.userOp.preVerificationGas),
          maxFeePerGas: BigInt(prepared.userOp.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(prepared.userOp.maxPriorityFeePerGas),
          paymaster: prepared.userOp.paymaster as Address | null,
          paymasterVerificationGasLimit: prepared.userOp
            .paymasterVerificationGasLimit
            ? BigInt(prepared.userOp.paymasterVerificationGasLimit)
            : null,
          paymasterPostOpGasLimit: prepared.userOp.paymasterPostOpGasLimit
            ? BigInt(prepared.userOp.paymasterPostOpGasLimit)
            : null,
          paymasterData: prepared.userOp.paymasterData as Hex | null,
          signature: "0x",
        };

        // Sign with passkey (triggers biometric prompt)
        const signature = await signUserOp(userOp, credentialId, 0);

        // ----------------------------------------
        // Step 4: Submit to bundler
        // ----------------------------------------
        setState({ status: "submitting" });

        const submitResult = await trpc.submitUserOp.mutate({
          sender: senderAddress,
          to,
          value: amount,
          nonce: prepared.userOp.nonce,
          factory: prepared.userOp.factory,
          factoryData: prepared.userOp.factoryData,
          callData: prepared.userOp.callData,
          callGasLimit: prepared.userOp.callGasLimit,
          verificationGasLimit: prepared.userOp.verificationGasLimit,
          preVerificationGas: prepared.userOp.preVerificationGas,
          maxFeePerGas: prepared.userOp.maxFeePerGas,
          maxPriorityFeePerGas: prepared.userOp.maxPriorityFeePerGas,
          paymaster: prepared.userOp.paymaster,
          paymasterVerificationGasLimit:
            prepared.userOp.paymasterVerificationGasLimit,
          paymasterPostOpGasLimit: prepared.userOp.paymasterPostOpGasLimit,
          paymasterData: prepared.userOp.paymasterData,
          signature,
        });

        // ----------------------------------------
        // Step 5: Wait for confirmation
        // ----------------------------------------
        setState({ status: "confirming", userOpHash: submitResult.userOpHash });

        const receipt = await trpc.waitForUserOp.mutate({
          userOpHash: submitResult.userOpHash,
        });

        // ----------------------------------------
        // Success!
        // ----------------------------------------
        setState({ status: "success", txHash: receipt.txHash });
        onSuccess?.(receipt.txHash);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        setState({ status: "error", message });
        onError?.(message);
      }
    },
    [senderAddress, credentialId, onSuccess, onError]
  );

  // Determine if in an active sending state
  const isSending =
    state.status !== "idle" &&
    state.status !== "success" &&
    state.status !== "error";

  return {
    state,
    send,
    reset,
    isSending,
    statusMessage: getStatusMessage(state),
  };
}
