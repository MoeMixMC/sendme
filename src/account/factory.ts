/**
 * Smart Account Factory - Counterfactual Address Computation
 * ===========================================================
 *
 * In ERC-4337, smart accounts are deployed via factory contracts using CREATE2.
 * CREATE2 is a special opcode that creates contracts at deterministic addresses
 * based on: deployer address + salt + init code hash.
 *
 * This enables "counterfactual" accounts - we can compute an account's address
 * BEFORE it's deployed. This is powerful because:
 *
 * 1. Users can receive funds at their address before paying for deployment
 * 2. The address is deterministic - same inputs always give same address
 * 3. Deployment is deferred until the first transaction (lazy deployment)
 *
 * Flow:
 * 1. User creates a passkey (P-256 public key)
 * 2. We compute their account address using the factory's getAddress()
 * 3. User can receive ETH/tokens at this address
 * 4. On first UserOp, the factory deploys the account at that address
 *
 * The DaimoAccountFactoryV2 is already deployed on Base Sepolia.
 * We just call its getAddress() function to compute addresses.
 */

import {
  createPublicClient,
  http,
  type Hex,
  type Address,
  zeroAddress,
} from "viem";
import { baseSepolia } from "viem/chains";

/**
 * DaimoAccountFactoryV2 Contract Address
 *
 * This factory was deployed by the Daimo team on Base Sepolia.
 * It creates DaimoAccountV2 instances that support:
 * - P-256 (passkey) signatures via WebAuthn
 * - Multiple signing keys with key slots
 * - Cross-chain features (not used in this simple version)
 *
 * The factory is immutable and permissionless - anyone can create accounts.
 */
export const FACTORY_ADDRESS = "0x6391426be3228106f8576550D25b54bcB1306f30" as const;

/**
 * Factory ABI - getAddress function only
 *
 * getAddress() computes what the account address WILL BE when deployed.
 * It uses the same CREATE2 calculation that createAccount() uses.
 *
 * Parameters must match exactly what will be passed to createAccount():
 * - homeChain: Chain ID where the account "lives" (for cross-chain features)
 * - homeCoin: Default stablecoin address (not used in simple version)
 * - swapper: DEX aggregator address (not used in simple version)
 * - bridger: Bridge contract address (not used in simple version)
 * - keySlot: Index of the signing key (0 = first key)
 * - key: P-256 public key as [x, y] coordinates (32 bytes each)
 * - salt: Additional uniqueness factor (we use 0)
 */
const factoryAbi = [
  {
    inputs: [
      { name: "homeChain", type: "uint256" },
      { name: "homeCoin", type: "address" },
      { name: "swapper", type: "address" },
      { name: "bridger", type: "address" },
      { name: "keySlot", type: "uint8" },
      { name: "key", type: "bytes32[2]" },
      { name: "salt", type: "uint256" },
    ],
    name: "getAddress",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Viem client for Base Sepolia
 *
 * We use this to call the factory's view function.
 * This is a read-only call, so no gas is needed.
 */
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

/**
 * Compute the counterfactual smart account address
 *
 * Given a P-256 public key (from a passkey), compute the address
 * where the smart account will be deployed.
 *
 * The address is deterministic:
 * - Same public key → same address (on the same chain)
 * - Address is valid before deployment
 * - Can receive ETH/tokens immediately
 *
 * @param publicKeyX - X coordinate of P-256 public key (32 bytes, hex)
 * @param publicKeyY - Y coordinate of P-256 public key (32 bytes, hex)
 * @returns The smart account address
 */
export async function getSmartAccountAddress(
  publicKeyX: Hex,
  publicKeyY: Hex
): Promise<Address> {
  const address = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getAddress",
    args: [
      BigInt(baseSepolia.id), // homeChain: Base Sepolia (84532)
      zeroAddress,            // homeCoin: not using stablecoin features
      zeroAddress,            // swapper: not using DEX features
      zeroAddress,            // bridger: not using bridge features
      0,                      // keySlot: first key slot
      [publicKeyX, publicKeyY] as readonly [Hex, Hex], // P-256 public key
      0n,                     // salt: 0 for simplicity
    ],
  });

  return address;
}

/**
 * Chain ID for Base Sepolia
 *
 * Used when constructing UserOperations and for chain-specific logic.
 * Base Sepolia is the testnet for Base (Coinbase's L2).
 */
export const CHAIN_ID = baseSepolia.id;
