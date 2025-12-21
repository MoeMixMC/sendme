/**
 * Bundler Integration for ERC-4337
 * =================================
 *
 * In ERC-4337, users don't submit transactions directly to the blockchain.
 * Instead, they send UserOperations to "bundlers" - specialized services that:
 *
 * 1. Collect UserOperations from multiple users
 * 2. Validate them off-chain (simulate to check they'll succeed)
 * 3. Bundle them into a single transaction
 * 4. Submit to the EntryPoint contract
 * 5. Get paid for gas via the UserOps themselves
 *
 * This architecture provides several benefits:
 * - Users don't need ETH in an EOA to pay gas
 * - Failed UserOps don't cost users money (bundler eats the cost)
 * - Better UX with off-chain validation
 * - MEV protection (bundlers can use private mempools)
 *
 * We use Pimlico as our bundler service. They provide:
 * - Bundler RPC endpoints for all major chains
 * - Paymaster services for gas sponsorship
 * - Gas estimation endpoints
 *
 * The bundler exposes a JSON-RPC API with ERC-4337 specific methods:
 * - eth_sendUserOperation: Submit a UserOp
 * - eth_estimateUserOperationGas: Estimate gas limits
 * - eth_getUserOperationReceipt: Check if UserOp was included
 * - pimlico_getUserOperationGasPrice: Get current gas prices
 */

import type { Address, Hex } from "viem";
import { ENTRY_POINT_ADDRESS } from "./userOp";

/**
 * UserOperation format for bundler RPC (ERC-4337 v0.7)
 *
 * This is the "unpacked" format that bundlers accept via JSON-RPC.
 * All numeric values are hex-encoded strings.
 * Optional fields (factory, paymaster) are omitted when not used.
 */
export interface UserOperationV07 {
  sender: Address;
  nonce: Hex;
  factory?: Address;           // Only for first tx (account deployment)
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  paymaster?: Address;         // Only if using gas sponsorship
  paymasterVerificationGasLimit?: Hex;
  paymasterPostOpGasLimit?: Hex;
  paymasterData?: Hex;
  signature: Hex;
}

/**
 * Pimlico Bundler RPC Endpoint
 *
 * Pimlico provides bundler infrastructure for ERC-4337.
 * The v2 API supports both EntryPoint v0.6 and v0.7.
 * Chain ID 84532 = Base Sepolia testnet.
 */
const PIMLICO_BASE_SEPOLIA_RPC = `https://api.pimlico.io/v2/84532/rpc`;

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// API key management - set from environment variable
let pimlicoApiKey: string | null = null;

export function setPimlicoApiKey(key: string) {
  pimlicoApiKey = key;
}

function getRpcUrl(): string {
  if (!pimlicoApiKey) {
    throw new Error("Pimlico API key not set. Set PIMLICO_API_KEY environment variable.");
  }
  return `${PIMLICO_BASE_SEPOLIA_RPC}?apikey=${pimlicoApiKey}`;
}

/**
 * Send a JSON-RPC request to the Pimlico bundler
 *
 * This is a generic helper for all bundler RPC calls.
 * Includes logging for debugging and detailed error messages.
 */
async function rpcCall<T>(method: string, params: any[]): Promise<T> {
  const requestBody = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  };

  console.log(`Bundler RPC call: ${method}`);
  console.log("Request:", JSON.stringify(requestBody, null, 2));

  const response = await fetch(getRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const json = (await response.json()) as JsonRpcResponse<T>;

  if (json.error) {
    console.error("Bundler RPC error:", JSON.stringify(json.error, null, 2));
    const details = json.error.data ? ` - ${JSON.stringify(json.error.data)}` : "";
    throw new Error(`Bundler error: ${json.error.message}${details}`);
  }

  console.log("Response:", JSON.stringify(json.result, null, 2));
  return json.result as T;
}

/**
 * Submit a UserOperation to the bundler
 *
 * eth_sendUserOperation is the main method for submitting UserOps.
 * Returns a userOpHash which can be used to track the operation.
 *
 * The bundler will:
 * 1. Validate the UserOp (simulate on-chain)
 * 2. Add it to their mempool
 * 3. Bundle it with other UserOps when economically viable
 * 4. Submit the bundle to the EntryPoint
 *
 * Note: A successful response only means the bundler accepted the UserOp.
 * You need to poll eth_getUserOperationReceipt to confirm on-chain inclusion.
 */
export async function sendUserOperation(
  userOp: UserOperationV07
): Promise<Hex> {
  const userOpHash = await rpcCall<Hex>("eth_sendUserOperation", [
    userOp,
    ENTRY_POINT_ADDRESS,
  ]);

  return userOpHash;
}

/**
 * UserOperation Receipt
 *
 * Returned by eth_getUserOperationReceipt after the UserOp is included on-chain.
 * Contains the transaction details and whether execution succeeded.
 */
export interface UserOpReceipt {
  userOpHash: Hex;
  sender: Address;
  nonce: Hex;
  actualGasCost: Hex;    // Actual gas paid (in wei)
  actualGasUsed: Hex;    // Actual gas consumed
  success: boolean;      // Did the account's execution succeed?
  logs: any[];
  receipt: {
    transactionHash: Hex;  // The bundle transaction hash
    blockNumber: Hex;
    blockHash: Hex;
  };
}

/**
 * Get the receipt for a UserOperation
 *
 * Returns null if the UserOp hasn't been included yet.
 * Returns the receipt once it's on-chain (even if execution failed).
 */
export async function getUserOperationReceipt(
  userOpHash: Hex
): Promise<UserOpReceipt | null> {
  const receipt = await rpcCall<UserOpReceipt | null>(
    "eth_getUserOperationReceipt",
    [userOpHash]
  );
  return receipt;
}

/**
 * Wait for a UserOperation to be included on-chain
 *
 * Polls the bundler every 2 seconds until the UserOp is included
 * or the timeout is reached. This is how you confirm a transaction.
 *
 * Note: "success" in the receipt means the account execution succeeded.
 * A failed execution (e.g., transfer to invalid address) still gets included
 * on-chain, the user just paid gas for a failed operation.
 */
export async function waitForUserOperation(
  userOpHash: Hex,
  timeout: number = 60000
): Promise<UserOpReceipt> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const receipt = await getUserOperationReceipt(userOpHash);
    if (receipt) {
      return receipt;
    }
    // Wait 2 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Timeout waiting for UserOperation receipt");
}

/**
 * Gas Price Recommendations from Pimlico
 *
 * ERC-4337 uses EIP-1559 gas pricing (maxFeePerGas + maxPriorityFeePerGas).
 * Pimlico provides recommended gas prices based on current network conditions.
 *
 * slow/standard/fast correspond to different confirmation time expectations.
 */
export interface GasPrices {
  slow: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  standard: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
}

/**
 * Get current gas price recommendations
 *
 * pimlico_getUserOperationGasPrice is a Pimlico-specific method.
 * We use "fast" prices for better UX (quick confirmation).
 */
export async function getGasPrices(): Promise<GasPrices> {
  return rpcCall<GasPrices>("pimlico_getUserOperationGasPrice", []);
}

/**
 * Gas Estimation Response
 *
 * ERC-4337 has three gas components that need to be estimated:
 * - preVerificationGas: Overhead for bundler (calldata size, etc.)
 * - verificationGasLimit: Signature validation + account deployment
 * - callGasLimit: Actual execution of the account's operation
 */
export interface GasEstimate {
  preVerificationGas: Hex;
  verificationGasLimit: Hex;
  callGasLimit: Hex;
  paymasterVerificationGasLimit?: Hex;
  paymasterPostOpGasLimit?: Hex;
}

/**
 * Estimate gas for a UserOperation
 *
 * The bundler simulates the UserOp and returns accurate gas estimates.
 * This helps avoid overpaying for gas or running out mid-execution.
 *
 * Note: This requires a valid (or dummy) signature. Some bundlers are
 * lenient with dummy signatures during estimation, others are strict.
 */
export async function estimateUserOperationGas(
  userOp: UserOperationV07
): Promise<GasEstimate> {
  return rpcCall<GasEstimate>("eth_estimateUserOperationGas", [
    userOp,
    ENTRY_POINT_ADDRESS,
  ]);
}

/**
 * Get the current nonce for an account
 *
 * ERC-4337 nonces are managed by the EntryPoint, not the account itself.
 * This queries the EntryPoint's getNonce(address, key) function.
 *
 * The nonce has two parts:
 * - key (192 bits): Allows parallel nonce sequences
 * - sequence (64 bits): Sequential counter for each key
 *
 * We use key=0 for simplicity, giving us a simple sequential nonce.
 *
 * IMPORTANT: This uses a regular RPC endpoint, not the bundler!
 * The bundler only handles ERC-4337 specific methods.
 */
export async function getAccountNonce(
  address: Address,
  key: bigint = 0n
): Promise<bigint> {
  // Call the EntryPoint's getNonce function directly via eth_call
  // getNonce selector: 0x35567e1a
  const response = await fetch("https://sepolia.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "eth_call",
      params: [
        {
          to: ENTRY_POINT_ADDRESS,
          data: `0x35567e1a${address.slice(2).padStart(64, "0")}${key.toString(16).padStart(64, "0")}`,
        },
        "latest",
      ],
    }),
  });

  const json = await response.json() as { result?: Hex; error?: any };
  if (json.error) {
    throw new Error(`Failed to get nonce: ${json.error.message}`);
  }

  return BigInt(json.result || "0x0");
}

/**
 * Paymaster Sponsorship Response
 *
 * Paymasters are contracts that pay for UserOp gas on behalf of users.
 * This enables gasless UX - users don't need ETH to transact.
 *
 * Use cases:
 * - App sponsors all user transactions (user acquisition)
 * - Subscription model (users pay monthly, get unlimited txs)
 * - Pay with ERC-20 tokens instead of ETH
 *
 * The paymaster returns data that gets included in the UserOp.
 * This data typically includes a signature proving the paymaster
 * agrees to pay for this specific UserOp.
 */
export interface SponsoredUserOp {
  paymaster: Address;
  paymasterVerificationGasLimit: Hex;
  paymasterPostOpGasLimit: Hex;
  paymasterData: Hex;
}

/**
 * Request gas sponsorship from Pimlico's paymaster
 *
 * pm_sponsorUserOperation is a Pimlico-specific method.
 * If successful, the returned values should be added to the UserOp
 * before signing and submitting.
 *
 * Note: This is currently unused in our simple implementation.
 * Users must have ETH in their smart account to pay for gas.
 * Adding paymaster support would enable gasless onboarding.
 */
export async function sponsorUserOperation(
  userOp: UserOperationV07
): Promise<SponsoredUserOp | null> {
  try {
    const result = await rpcCall<SponsoredUserOp>(
      "pm_sponsorUserOperation",
      [userOp, ENTRY_POINT_ADDRESS]
    );
    return result;
  } catch (err) {
    console.error("Sponsorship failed:", err);
    return null;
  }
}
