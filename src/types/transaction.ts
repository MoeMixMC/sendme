/**
 * Transaction Type Definitions
 * ============================
 *
 * These types represent transactions and UserOperations in our ERC-4337 wallet.
 *
 * KEY CONCEPT: UserOperation vs Transaction
 * - Traditional Ethereum uses "transactions" signed by EOAs
 * - ERC-4337 uses "UserOperations" signed by smart accounts
 * - UserOps are submitted to a bundler, which batches them into regular transactions
 */

import type { Address, Hex } from "viem";

/**
 * Transaction status in our database
 */
export type TransactionStatus = "pending" | "confirmed" | "failed";

/**
 * Transaction - A completed or pending transaction in history
 *
 * This is the user-facing representation of a transaction,
 * simplified from the full UserOperation format.
 */
export interface Transaction {
  /** Database ID */
  id: number;
  /** The UserOperation hash (unique identifier from bundler) */
  userOpHash: string;
  /** Sender smart account address */
  sender: string;
  /** Sender username (if known) */
  senderName: string | null;
  /** Recipient address */
  toAddress: string;
  /** Recipient username (if known) */
  toName: string | null;
  /** Amount sent (as decimal string, e.g., "0.01") */
  value: string;
  /** Current status */
  status: TransactionStatus;
  /** On-chain transaction hash (null if pending) */
  txHash: string | null;
  /** When the transaction was created */
  createdAt: Date;
}

/**
 * SendTransactionInput - Input for initiating a send
 */
export interface SendTransactionInput {
  to: `0x${string}`;
  /** Amount in ETH as decimal string (e.g., "0.01") */
  amount: string;
}

/**
 * UserOperation - ERC-4337 UserOperation structure
 *
 * This is the core data structure of Account Abstraction.
 * It's like a transaction, but for smart accounts.
 *
 * KEY FIELDS:
 * - sender: The smart account address
 * - nonce: Prevents replay attacks (managed by EntryPoint)
 * - factory/factoryData: Deploys account if not yet deployed
 * - callData: The actual operation to execute (e.g., transfer ETH)
 * - signature: P-256 signature from the passkey
 */
export interface UserOperation {
  sender: Address;
  nonce: bigint;
  factory: Address | null;
  factoryData: Hex | null;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster: Address | null;
  paymasterVerificationGasLimit: bigint | null;
  paymasterPostOpGasLimit: bigint | null;
  paymasterData: Hex | null;
  signature: Hex;
}

/**
 * PreparedUserOp - Server response with unsigned UserOp data
 *
 * The server prepares everything except the signature.
 * Frontend signs with passkey, then submits.
 */
export interface PreparedUserOp {
  userOp: {
    sender: string;
    nonce: string;
    factory: string | null;
    factoryData: string | null;
    callData: string;
    callGasLimit: string;
    verificationGasLimit: string;
    preVerificationGas: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
    paymaster: string | null;
    paymasterVerificationGasLimit: string | null;
    paymasterPostOpGasLimit: string | null;
    paymasterData: string | null;
  };
  credentialId: string;
  isDeployed: boolean;
}

/**
 * SubmitUserOpResult - Response after submitting to bundler
 */
export interface SubmitUserOpResult {
  userOpHash: string;
}

/**
 * UserOpReceipt - Response after waiting for confirmation
 */
export interface UserOpReceipt {
  txHash: string;
  success: boolean;
}
