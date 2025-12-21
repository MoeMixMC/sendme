/**
 * UserOperation Building and Signing for ERC-4337
 * ================================================
 *
 * ERC-4337 (Account Abstraction) replaces traditional EOA transactions with "UserOperations".
 * Instead of signing a transaction with a private key, users sign a UserOperation that gets
 * submitted to a "bundler" which batches multiple UserOps into a single transaction.
 *
 * Key differences from traditional transactions:
 * - Users don't need ETH in their EOA to pay gas (can use paymasters)
 * - Accounts are smart contracts, not just public key hashes
 * - Signature validation is programmable (passkeys, multisig, social recovery, etc.)
 * - Accounts are deployed lazily on first use (counterfactual deployment)
 *
 * Flow:
 * 1. User wants to send ETH or call a contract
 * 2. App builds a UserOperation with the desired action
 * 3. User signs the UserOp hash with their passkey
 * 4. App sends the signed UserOp to a bundler
 * 5. Bundler submits it to the EntryPoint contract
 * 6. EntryPoint validates signature, deploys account if needed, executes the action
 */

import {
  type Hex,
  type Address,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  concat,
  pad,
  toHex,
  zeroAddress,
} from "viem";
import { baseSepolia } from "viem/chains";
import { signWithPasskey } from "../webauthn/passkey";
import { bytesToHex, hexToBytes } from "../webauthn/utils";
import { FACTORY_ADDRESS } from "./factory";

/**
 * EntryPoint Contract Address (v0.7)
 *
 * The EntryPoint is the singleton contract that all ERC-4337 UserOperations go through.
 * It's deployed at the same address on all EVM chains (using CREATE2).
 *
 * The EntryPoint:
 * - Validates UserOperation signatures by calling the account's validateUserOp()
 * - Handles account deployment via factory contracts
 * - Executes the actual operation on the account
 * - Manages gas payments and refunds
 * - Provides replay protection via nonces
 */
export const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;

/**
 * UserOperation Structure (ERC-4337 v0.7)
 *
 * This is the "transaction" format for smart accounts. Each field serves a specific purpose:
 */
export interface UserOperation {
  /** The smart account address that will execute this operation */
  sender: Address;

  /**
   * Replay protection nonce. Unlike EOA nonces, ERC-4337 uses a 2D nonce:
   * - High 192 bits: "key" (allows parallel transactions with different keys)
   * - Low 64 bits: sequential nonce for that key
   * For simplicity, we use key=0 and sequential nonces.
   */
  nonce: bigint;

  /**
   * Factory address for deploying the account (null if already deployed).
   * On the first transaction, the bundler calls factory.createAccount() to deploy.
   */
  factory: Address | null;

  /** Calldata for the factory's createAccount function */
  factoryData: Hex | null;

  /**
   * The actual operation to execute on the account.
   * For DaimoAccountV2, this is typically executeBatch([{dest, value, data}])
   */
  callData: Hex;

  /**
   * Gas limits - ERC-4337 separates gas into three parts:
   * - callGasLimit: Gas for executing the account's operation
   * - verificationGasLimit: Gas for signature validation + account deployment
   * - preVerificationGas: Gas for bundler overhead (calldata, etc.)
   */
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;

  /** EIP-1559 gas pricing (same as regular transactions) */
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;

  /**
   * Paymaster fields (optional) - allows third parties to pay for gas.
   * If null, the account itself must have ETH to pay.
   * Paymasters enable gasless UX, subscription models, sponsored transactions, etc.
   */
  paymaster: Address | null;
  paymasterVerificationGasLimit: bigint | null;
  paymasterPostOpGasLimit: bigint | null;
  paymasterData: Hex | null;

  /** The signature over the UserOp hash, verified by the account contract */
  signature: Hex;
}

/**
 * Packed UserOperation format (for on-chain/bundler use)
 * Some fields are concatenated to save calldata gas.
 */
export interface PackedUserOperation {
  sender: Address;
  nonce: Hex;
  initCode: Hex;  // factory + factoryData concatenated
  callData: Hex;
  accountGasLimits: Hex;  // verificationGasLimit + callGasLimit packed
  preVerificationGas: Hex;
  gasFees: Hex;  // maxPriorityFeePerGas + maxFeePerGas packed
  paymasterAndData: Hex;  // paymaster + all paymaster fields concatenated
  signature: Hex;
}

/**
 * DaimoAccountV2 executeBatch ABI
 *
 * DaimoAccountV2 uses a batch execution pattern where all operations are
 * wrapped in Call structs. This allows multiple operations in one UserOp
 * and provides a consistent interface.
 *
 * The Call struct mirrors Solidity's low-level call: (address, value, data)
 */
const executeBatchAbi = [
  {
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "dest", type: "address" },   // Target contract/EOA
          { name: "value", type: "uint256" },  // ETH to send
          { name: "data", type: "bytes" },     // Calldata (empty for plain ETH transfer)
        ],
      },
    ],
    name: "executeBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * DaimoAccountFactoryV2 createAccount ABI
 *
 * The factory creates new account instances using CREATE2, which gives
 * deterministic addresses. This enables "counterfactual" accounts - we can
 * compute the address before deployment and even receive funds there.
 *
 * Parameters define the account's configuration:
 * - homeChain/homeCoin: For cross-chain features (not used in simple version)
 * - swapper/bridger: DEX and bridge integrations (not used in simple version)
 * - keySlot + key: The initial signing key (passkey public key)
 * - salt: For address uniqueness (we use 0)
 */
const factoryAbi = [
  {
    inputs: [
      { name: "homeChain", type: "uint256" },
      { name: "homeCoin", type: "address" },
      { name: "swapper", type: "address" },
      { name: "bridger", type: "address" },
      { name: "keySlot", type: "uint8" },
      { name: "key", type: "bytes32[2]" },  // P-256 public key [x, y]
      { name: "salt", type: "uint256" },
    ],
    name: "createAccount",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Build callData for a simple ETH transfer
 *
 * Wraps a plain ETH transfer in DaimoAccountV2's executeBatch format.
 * For ERC-20 transfers, you'd set data to the transfer() calldata instead.
 */
export function buildTransferCallData(to: Address, value: bigint): Hex {
  return encodeFunctionData({
    abi: executeBatchAbi,
    functionName: "executeBatch",
    args: [[{ dest: to, value, data: "0x" }]],  // Single call, no data = ETH transfer
  });
}

/**
 * Build initCode for first-time account deployment
 *
 * initCode = factory address + factory calldata
 *
 * When the EntryPoint sees initCode, it:
 * 1. Checks if sender already has code (skip if deployed)
 * 2. Calls the factory to deploy the account
 * 3. Verifies the deployed address matches sender
 */
export function buildInitCode(publicKeyX: Hex, publicKeyY: Hex): Hex {
  const factoryData = encodeFunctionData({
    abi: factoryAbi,
    functionName: "createAccount",
    args: [
      BigInt(baseSepolia.id), // homeChain - Base Sepolia chain ID
      zeroAddress,            // homeCoin - not using stablecoin features
      zeroAddress,            // swapper - not using DEX features
      zeroAddress,            // bridger - not using bridge features
      0,                      // keySlot - first key slot (accounts can have multiple keys)
      [publicKeyX, publicKeyY] as readonly [Hex, Hex], // P-256 public key from passkey
      0n,                     // salt - 0 for simplicity
    ],
  });

  // Concatenate factory address + calldata
  return concat([FACTORY_ADDRESS, factoryData]);
}

/**
 * Compute the UserOperation hash for signing
 *
 * The hash commits to all UserOp fields (except signature) plus the EntryPoint
 * address and chain ID. This prevents replay attacks across chains and EntryPoints.
 *
 * ERC-4337 v0.7 hash structure:
 * keccak256(keccak256(packedUserOp), entryPoint, chainId)
 */
export function getUserOpHash(userOp: UserOperation): Hex {
  const packed = packUserOpForHash(userOp);
  const userOpHash = keccak256(packed);

  // Include EntryPoint and chainId for replay protection
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32, address, uint256"),
      [userOpHash, ENTRY_POINT_ADDRESS, BigInt(baseSepolia.id)]
    )
  );
}

/**
 * Pack UserOp fields for hashing (v0.7 format)
 *
 * Dynamic fields (initCode, callData, paymasterAndData) are hashed individually
 * to create a fixed-size structure. Gas fields are packed into bytes32.
 */
function packUserOpForHash(userOp: UserOperation): Hex {
  // Concatenate factory + factoryData (or empty if deployed)
  const initCode = userOp.factory
    ? concat([userOp.factory, userOp.factoryData || "0x"])
    : "0x";

  // Pack gas limits: verificationGasLimit (16 bytes) + callGasLimit (16 bytes)
  const accountGasLimits = concat([
    pad(toHex(userOp.verificationGasLimit), { size: 16 }),
    pad(toHex(userOp.callGasLimit), { size: 16 }),
  ]);

  // Pack gas prices: maxPriorityFeePerGas (16 bytes) + maxFeePerGas (16 bytes)
  const gasFees = concat([
    pad(toHex(userOp.maxPriorityFeePerGas), { size: 16 }),
    pad(toHex(userOp.maxFeePerGas), { size: 16 }),
  ]);

  // Concatenate all paymaster fields (or empty if self-paying)
  let paymasterAndData: Hex = "0x";
  if (userOp.paymaster) {
    paymasterAndData = concat([
      userOp.paymaster,
      pad(toHex(userOp.paymasterVerificationGasLimit || 0n), { size: 16 }),
      pad(toHex(userOp.paymasterPostOpGasLimit || 0n), { size: 16 }),
      userOp.paymasterData || "0x",
    ]);
  }

  // ABI encode with dynamic fields hashed
  return encodeAbiParameters(
    parseAbiParameters("address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32"),
    [
      userOp.sender,
      userOp.nonce,
      keccak256(initCode),        // Hash of initCode
      keccak256(userOp.callData), // Hash of callData
      accountGasLimits,           // Packed gas limits (bytes32)
      userOp.preVerificationGas,
      gasFees,                    // Packed gas prices (bytes32)
      keccak256(paymasterAndData), // Hash of paymaster data
    ]
  );
}

/**
 * Sign a UserOperation with a passkey (WebAuthn)
 *
 * DaimoAccountV2 uses P-256 (secp256r1) signatures via WebAuthn, which enables:
 * - Biometric authentication (Face ID, Touch ID, fingerprint)
 * - Hardware security (Secure Enclave, TPM)
 * - No seed phrases or private key management
 *
 * The signature format is specific to DaimoAccountV2:
 * - First 6 bytes: validUntil (uint48) - signature expiration timestamp
 * - Remaining bytes: ABI-encoded Signature struct
 *
 * The challenge being signed is: validUntil + userOpHash (38 bytes total)
 * This binds the signature to both the operation and its validity period.
 */
export async function signUserOp(
  userOp: UserOperation,
  credentialId: string,
  keySlot: number = 0
): Promise<Hex> {
  const hash = getUserOpHash(userOp);

  // validUntil = 0 means no expiration (valid forever)
  // In production, you might set this to currentTime + 1 hour for security
  const validUntil = 0n;
  const validUntilBytes = new Uint8Array(6);
  // Convert to 6-byte big-endian representation
  for (let i = 5; i >= 0; i--) {
    validUntilBytes[5 - i] = Number((validUntil >> BigInt(i * 8)) & 0xffn);
  }

  // Challenge = validUntil (6 bytes) + userOpHash (32 bytes) = 38 bytes
  // This is what gets base64url-encoded in the WebAuthn clientDataJSON
  const hashBytes = hexToBytes(hash);
  const challenge = new Uint8Array(38);
  challenge.set(validUntilBytes, 0);
  challenge.set(hashBytes, 6);

  // Trigger WebAuthn signing - user sees biometric prompt
  const sig = await signWithPasskey(challenge, credentialId);

  /**
   * DaimoAccountV2 Signature struct:
   * - keySlot: Which signing key to verify against (accounts support multiple keys)
   * - authenticatorData: WebAuthn data (includes flags, sign count)
   * - clientDataJSON: Contains the challenge and origin
   * - r, s: The actual P-256 ECDSA signature values
   *
   * The contract reconstructs the signed message from authenticatorData + clientDataJSON
   * and verifies the P-256 signature against the stored public key.
   */
  const signatureStruct = encodeAbiParameters(
    parseAbiParameters("uint8, bytes, string, uint256, uint256"),
    [
      keySlot,
      bytesToHex(sig.authenticatorData),
      sig.clientDataJSON,
      sig.r,
      sig.s,
    ]
  );

  // Final signature = validUntil prefix + encoded struct
  const finalSignature = concat([
    bytesToHex(validUntilBytes),
    signatureStruct,
  ]);

  return finalSignature;
}

/**
 * Convert UserOperation to packed format for bundler submission
 *
 * Bundlers accept the "unpacked" format via JSON-RPC, but the on-chain
 * format is packed to save calldata gas. This function creates the
 * packed representation.
 */
export function packUserOp(userOp: UserOperation): PackedUserOperation {
  const initCode = userOp.factory
    ? concat([userOp.factory, userOp.factoryData || "0x"])
    : "0x";

  const accountGasLimits = concat([
    pad(toHex(userOp.verificationGasLimit), { size: 16 }),
    pad(toHex(userOp.callGasLimit), { size: 16 }),
  ]);

  const gasFees = concat([
    pad(toHex(userOp.maxPriorityFeePerGas), { size: 16 }),
    pad(toHex(userOp.maxFeePerGas), { size: 16 }),
  ]);

  let paymasterAndData: Hex = "0x";
  if (userOp.paymaster) {
    paymasterAndData = concat([
      userOp.paymaster,
      pad(toHex(userOp.paymasterVerificationGasLimit || 0n), { size: 16 }),
      pad(toHex(userOp.paymasterPostOpGasLimit || 0n), { size: 16 }),
      userOp.paymasterData || "0x",
    ]);
  }

  return {
    sender: userOp.sender,
    nonce: toHex(userOp.nonce),
    initCode,
    callData: userOp.callData,
    accountGasLimits,
    preVerificationGas: toHex(userOp.preVerificationGas),
    gasFees,
    paymasterAndData,
    signature: userOp.signature,
  };
}
