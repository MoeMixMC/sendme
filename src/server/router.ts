/**
 * tRPC API Router - Backend Endpoints for ERC-4337 Smart Wallet
 * ==============================================================
 *
 * This file defines all the backend API endpoints for our smart wallet.
 * We use tRPC for type-safe communication between frontend and backend.
 *
 * Key ERC-4337 endpoints:
 * - createSmartAccount: Register a new passkey-controlled account
 * - prepareUserOp: Build an unsigned UserOperation for the frontend to sign
 * - submitUserOp: Send a signed UserOperation to the bundler
 * - waitForUserOp: Wait for a UserOperation to be included on-chain
 *
 * Architecture Overview:
 * ----------------------
 *
 *   Frontend                Backend (this file)              Blockchain
 *   --------                ------------------               ----------
 *      |                          |                              |
 *      |-- createSmartAccount --->|                              |
 *      |                          |-- getAddress() ------------->|
 *      |                          |<-- counterfactual address ---|
 *      |                          |                              |
 *      |<-- address, username ----|                              |
 *      |                          |                              |
 *      |-- prepareUserOp -------->|                              |
 *      |                          |-- getAccountNonce() -------->|
 *      |                          |-- getGasPrices() ----------->| (bundler)
 *      |<-- unsigned UserOp ------|                              |
 *      |                          |                              |
 *      |   [Sign with passkey]    |                              |
 *      |                          |                              |
 *      |-- submitUserOp --------->|                              |
 *      |                          |-- sendUserOperation() ------>| (bundler)
 *      |<-- userOpHash -----------|                              |
 *      |                          |                              |
 *      |-- waitForUserOp -------->|                              |
 *      |                          |-- getUserOperationReceipt -->| (bundler)
 *      |<-- tx confirmation ------|                              |
 *
 * Why Split Prepare/Submit?
 * -------------------------
 * The UserOperation must be signed by the user's passkey, which only exists
 * on their device. So we:
 * 1. Backend prepares the UserOp (nonce, gas estimates, etc.)
 * 2. Frontend signs with passkey (triggers biometric prompt)
 * 3. Backend submits to bundler (has API keys, can retry, etc.)
 */

import { z } from "zod";
import { router, publicProcedure } from "./trpc";
import {
  getUserByAddress,
  getUserByName,
  setUsername,
  searchUsers,
  recordTransaction,
  getTransactionsByAddress,
  getTransactionByHash,
  cacheBalance,
  getCachedBalance,
  createSmartAccount as dbCreateSmartAccount,
  getSmartAccount,
  getSmartAccountByName,
  getSigningKey,
  getAccountByCredentialId,
  markAccountDeployed,
  createUserOp,
  updateUserOpStatus,
  getUserOpsByAddress,
  searchSmartAccounts,
} from "../db";
import { getSmartAccountAddress, FACTORY_ADDRESS } from "../account/factory";
import {
  buildTransferCallData,
  buildInitCode,
  ENTRY_POINT_ADDRESS,
  type UserOperation,
} from "../account/userOp";
import {
  sendUserOperation,
  waitForUserOperation,
  getGasPrices,
  estimateUserOperationGas,
  getAccountNonce,
  setPimlicoApiKey,
  type UserOperationV07,
} from "../account/bundler";
import {
  createPublicClient,
  http,
  formatEther,
  parseEther,
  type Address,
  type Hex,
  toHex,
  pad,
  concat,
} from "viem";
import { baseSepolia } from "viem/chains";

// Initialize Pimlico API key from environment
// Pimlico is our bundler - they batch UserOps and submit to the EntryPoint
if (process.env.PIMLICO_API_KEY) {
  setPimlicoApiKey(process.env.PIMLICO_API_KEY);
}

/**
 * Viem Public Client for Base Sepolia
 *
 * Used for read-only blockchain queries:
 * - Getting balances
 * - Checking if accounts are deployed
 * - Reading block numbers
 */
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Ethereum address validation pattern
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export type AppRouter = typeof appRouter;

export const appRouter = router({
  // ============================================================
  // HEALTH CHECK
  // ============================================================

  /**
   * Simple health check endpoint
   * Returns OK if the server is running
   */
  health: publicProcedure.query(() => {
    return { status: "ok", timestamp: Date.now() };
  }),

  // ============================================================
  // USER/ACCOUNT OPERATIONS (Legacy - for EOA users)
  // ============================================================

  /**
   * Get user by their Ethereum address
   * Returns null if user doesn't exist in our database
   */
  getUser: publicProcedure
    .input(z.object({ address: addressSchema }))
    .query(async ({ input }) => {
      const user = await getUserByAddress(input.address);
      return user;
    }),

  /**
   * Resolve a username to an address
   * Useful for "pay @username" features
   */
  resolveName: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      const user = await getUserByName(input.name);
      return user?.address || null;
    }),

  /**
   * Set or update username for an address
   * Creates user if doesn't exist (upsert)
   */
  setUsername: publicProcedure
    .input(
      z.object({
        address: addressSchema,
        name: z.string().min(3).max(20),
      })
    )
    .mutation(async ({ input }) => {
      // Check if name is already taken by someone else
      const existing = await getUserByName(input.name);
      if (existing && existing.address !== input.address.toLowerCase()) {
        throw new Error("Name already taken");
      }
      const user = await setUsername(input.address, input.name);
      return { success: true, user };
    }),

  /**
   * Search users by partial name or address match
   * Used for autocomplete in send flows
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ input }) => {
      const users = await searchUsers(input.query, input.limit);
      return users;
    }),

  // ============================================================
  // BALANCE OPERATIONS
  // ============================================================

  /**
   * Get ETH balance for an address
   *
   * Uses a simple cache (1 minute TTL) to reduce RPC calls.
   * In production, you might use WebSocket subscriptions for real-time updates.
   */
  getBalance: publicProcedure
    .input(z.object({ address: addressSchema }))
    .query(async ({ input }) => {
      // Check cache first (1 minute TTL)
      const cached = await getCachedBalance(input.address);
      if (cached) {
        return { balance: cached, cached: true };
      }

      // Fetch from chain via RPC
      const balance = await publicClient.getBalance({
        address: input.address as Address,
      });
      const formatted = formatEther(balance);

      // Cache the result
      await cacheBalance(input.address, formatted);

      return { balance: formatted, cached: false };
    }),

  // ============================================================
  // TRANSACTION OPERATIONS (Legacy - for EOA transactions)
  // ============================================================

  /**
   * Record a transaction in our database
   * Called after sending to track history
   */
  recordTx: publicProcedure
    .input(
      z.object({
        hash: z.string(),
        from: addressSchema,
        to: addressSchema,
        value: z.string(),
        blockNumber: z.number().optional(),
        status: z.enum(["pending", "confirmed", "failed"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const tx = await recordTransaction({
        hash: input.hash,
        from: input.from,
        to: input.to,
        value: input.value,
        blockNumber: input.blockNumber ? BigInt(input.blockNumber) : undefined,
        status: input.status,
      });
      return tx;
    }),

  /**
   * Get transaction history for an address
   * Returns both sent and received transactions
   */
  getHistory: publicProcedure
    .input(
      z.object({
        address: addressSchema,
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const transactions = await getTransactionsByAddress(
        input.address,
        input.limit
      );

      // Enrich with usernames for display
      const enriched = await Promise.all(
        transactions.map(async (tx: any) => {
          const fromUser = await getUserByAddress(tx.from_address);
          const toUser = await getUserByAddress(tx.to_address);
          return {
            ...tx,
            fromName: fromUser?.name || null,
            toName: toUser?.name || null,
          };
        })
      );

      return enriched;
    }),

  /**
   * Get a single transaction by hash
   */
  getTransaction: publicProcedure
    .input(z.object({ hash: z.string() }))
    .query(async ({ input }) => {
      const tx = await getTransactionByHash(input.hash);
      if (!tx) return null;

      const fromUser = await getUserByAddress(tx.from_address);
      const toUser = await getUserByAddress(tx.to_address);

      return {
        ...tx,
        fromName: fromUser?.name || null,
        toName: toUser?.name || null,
      };
    }),

  // ============================================================
  // CHAIN OPERATIONS
  // ============================================================

  /**
   * Get current block number
   * Useful for showing network status or confirmation depth
   */
  getBlockNumber: publicProcedure.query(async () => {
    const blockNumber = await publicClient.getBlockNumber();
    return { blockNumber: blockNumber.toString() };
  }),

  /**
   * Estimate gas for a simple ETH transfer
   * Note: For smart accounts, gas estimation is more complex (see prepareUserOp)
   */
  estimateGas: publicProcedure
    .input(
      z.object({
        from: addressSchema,
        to: addressSchema,
        value: z.string(), // ETH amount as string
      })
    )
    .query(async ({ input }) => {
      try {
        const gas = await publicClient.estimateGas({
          account: input.from as Address,
          to: input.to as Address,
          value: parseEther(input.value),
        });
        return { gas: gas.toString() };
      } catch (error: any) {
        // Default to 21000 for simple transfers (worst case)
        return { gas: "21000", error: error.message };
      }
    }),

  // ============================================================
  // SMART ACCOUNT OPERATIONS (ERC-4337)
  // ============================================================

  /**
   * Create a new smart account with passkey authentication
   *
   * This is the main onboarding endpoint. The flow is:
   * 1. Frontend creates a passkey (WebAuthn)
   * 2. Frontend sends us the public key coordinates
   * 3. We compute the counterfactual address using CREATE2
   * 4. We store the account info in our database
   * 5. We return the address (account is NOT deployed yet!)
   *
   * The account contract will be deployed on the first transaction,
   * using the initCode in the UserOperation.
   */
  createSmartAccount: publicProcedure
    .input(
      z.object({
        username: z.string().min(3).max(20),
        credentialId: z.string(), // Base64url-encoded WebAuthn credential ID
        publicKeyDer: z.string().regex(/^0x[a-fA-F0-9]+$/), // DER-encoded P-256 public key
        publicKeyX: z.string().regex(/^0x[a-fA-F0-9]{64}$/), // X coordinate (32 bytes)
        publicKeyY: z.string().regex(/^0x[a-fA-F0-9]{64}$/), // Y coordinate (32 bytes)
      })
    )
    .mutation(async ({ input }) => {
      // Check if username is already taken
      const existingName = await getSmartAccountByName(input.username);
      if (existingName) {
        throw new Error("Username already taken");
      }

      /**
       * Compute the counterfactual address
       *
       * This calls the factory's getAddress() function, which uses CREATE2
       * to compute where the account WILL be deployed. The address is
       * deterministic based on:
       * - Factory address
       * - Salt (we use 0)
       * - Init code hash (includes the public key)
       *
       * This is the magic of counterfactual deployment - we know the
       * address before the contract exists!
       */
      const address = await getSmartAccountAddress(
        input.publicKeyX as `0x${string}`,
        input.publicKeyY as `0x${string}`
      );

      // Check if this address already exists (shouldn't happen with unique keys)
      const existingAccount = await getSmartAccount(address);
      if (existingAccount) {
        throw new Error("Account already exists");
      }

      // Store in database
      const account = await dbCreateSmartAccount({
        address,
        name: input.username,
        credentialId: input.credentialId,
        publicKeyDer: input.publicKeyDer,
        publicKeyX: input.publicKeyX,
        publicKeyY: input.publicKeyY,
      });

      return {
        success: true,
        address,
        username: account.name,
      };
    }),

  /**
   * Get smart account by address
   * Returns account info and signing key details
   */
  getSmartAccountByAddress: publicProcedure
    .input(z.object({ address: addressSchema }))
    .query(async ({ input }) => {
      const account = await getSmartAccount(input.address);
      if (!account) return null;

      const key = await getSigningKey(input.address);
      return {
        ...account,
        signingKey: key,
      };
    }),

  /**
   * Resolve smart account name to address
   * For "send to @username" feature
   */
  resolveSmartAccountName: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      const account = await getSmartAccountByName(input.name);
      return account?.address || null;
    }),

  /**
   * Search smart accounts by username prefix
   * Returns matching accounts with last transaction context
   * Used for autocomplete in send flows
   */
  searchSmartAccounts: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        searcherAddress: addressSchema,
        limit: z.number().min(1).max(10).default(5),
      })
    )
    .query(async ({ input }) => {
      return searchSmartAccounts(input.query, input.searcherAddress, input.limit);
    }),

  /**
   * Get account by credential ID (for login)
   *
   * When a user authenticates with their passkey, we get back the
   * credential ID. This endpoint looks up which account that passkey
   * belongs to, enabling passwordless login.
   */
  getAccountByCredentialId: publicProcedure
    .input(z.object({ credentialId: z.string() }))
    .query(async ({ input }) => {
      const account = await getAccountByCredentialId(input.credentialId);
      if (!account) return null;
      return {
        address: account.address,
        name: account.name,
        deployed: account.deployed,
      };
    }),

  // ============================================================
  // USEROP / SEND OPERATIONS (ERC-4337 Core)
  // ============================================================

  /**
   * Prepare a UserOperation for sending ETH
   *
   * This is the first step in sending a transaction. We:
   * 1. Look up the account and its signing key
   * 2. Check if the account is deployed on-chain
   * 3. Get the current nonce from the EntryPoint
   * 4. Build the callData (what the account should do)
   * 5. Build initCode if account needs to be deployed
   * 6. Get current gas prices from the bundler
   * 7. Estimate gas limits
   *
   * Returns an unsigned UserOp that the frontend will sign with the passkey.
   *
   * Why return bigints as strings?
   * JSON doesn't support bigint, so we serialize to strings.
   * Frontend converts back to bigint for signing.
   */
  prepareUserOp: publicProcedure
    .input(
      z.object({
        sender: addressSchema,
        to: addressSchema,
        value: z.string(), // ETH amount as string (e.g., "0.01")
      })
    )
    .mutation(async ({ input }) => {
      const sender = input.sender as Address;
      const to = input.to as Address;
      const value = parseEther(input.value);

      // Get account info from our database
      const account = await getSmartAccount(input.sender);
      if (!account) {
        throw new Error("Account not found");
      }

      // Get the signing key (needed for initCode if deploying)
      const signingKey = await getSigningKey(input.sender);
      if (!signingKey) {
        throw new Error("Signing key not found");
      }

      /**
       * Check if account is deployed
       *
       * If getCode() returns "0x" or undefined, the account is not deployed.
       * In that case, we need to include initCode in the UserOp to deploy it.
       */
      const code = await publicClient.getCode({ address: sender });
      const isDeployed = code && code !== "0x";

      /**
       * Get the nonce from the EntryPoint
       *
       * ERC-4337 nonces are managed by the EntryPoint, not the account.
       * This provides replay protection and allows parallel transactions
       * using different nonce keys.
       */
      const nonce = await getAccountNonce(sender);

      /**
       * Build callData for the account
       *
       * DaimoAccountV2 uses executeBatch([{dest, value, data}]) for all operations.
       * For a simple ETH transfer, data is empty ("0x").
       */
      const callData = buildTransferCallData(to, value);

      /**
       * Build initCode if account not deployed
       *
       * initCode = factory address + factory.createAccount(...) calldata
       *
       * When the EntryPoint sees initCode, it calls the factory to deploy
       * the account before executing the operation.
       */
      let factory: Address | null = null;
      let factoryData: Hex | null = null;
      if (!isDeployed) {
        factory = FACTORY_ADDRESS;
        const initCode = buildInitCode(
          signingKey.public_key_x as Hex,
          signingKey.public_key_y as Hex
        );
        // Remove factory address prefix (first 42 chars = 20 bytes + 0x)
        factoryData = ("0x" + initCode.slice(42)) as Hex;
      }

      /**
       * Get gas prices from Pimlico
       *
       * We use "fast" prices for better UX (quick confirmation).
       * EIP-1559 pricing: maxFeePerGas + maxPriorityFeePerGas
       */
      const gasPrices = await getGasPrices();

      /**
       * Build the UserOperation structure
       *
       * Gas limits are initially set high and will be refined by estimation.
       * The bundler will reject UserOps with insufficient gas.
       */
      const userOp: UserOperation = {
        sender,
        nonce,
        factory,
        factoryData,
        callData,
        // Initial gas estimates (will be refined below)
        callGasLimit: 200000n,
        // verificationGasLimit is higher for deployment (new account + signature check)
        verificationGasLimit: isDeployed ? 150000n : 600000n,
        preVerificationGas: 100000n,
        maxFeePerGas: BigInt(gasPrices.fast.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(gasPrices.fast.maxPriorityFeePerGas),
        // No paymaster in this simple version - user pays gas from their account
        paymaster: null,
        paymasterVerificationGasLimit: null,
        paymasterPostOpGasLimit: null,
        paymasterData: null,
        signature: "0x", // Placeholder - frontend will sign
      };

      /**
       * Estimate gas more accurately via bundler
       *
       * eth_estimateUserOperationGas simulates the UserOp and returns
       * accurate gas limits. This helps avoid overpaying or running out of gas.
       *
       * We use a dummy signature for estimation - some bundlers require
       * a valid-looking signature even for estimation.
       */
      try {
        const estimateUserOp: UserOperationV07 = {
          sender: userOp.sender,
          nonce: toHex(userOp.nonce),
          callData: userOp.callData,
          callGasLimit: toHex(userOp.callGasLimit),
          verificationGasLimit: toHex(userOp.verificationGasLimit),
          preVerificationGas: toHex(userOp.preVerificationGas),
          maxFeePerGas: toHex(userOp.maxFeePerGas),
          maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
          signature: ("0x" + "00".repeat(65)) as Hex, // Dummy signature
        };
        if (userOp.factory) {
          estimateUserOp.factory = userOp.factory;
          estimateUserOp.factoryData = userOp.factoryData || "0x";
        }
        const gasEstimate = await estimateUserOperationGas(estimateUserOp);
        userOp.callGasLimit = BigInt(gasEstimate.callGasLimit);
        userOp.verificationGasLimit = BigInt(gasEstimate.verificationGasLimit);
        userOp.preVerificationGas = BigInt(gasEstimate.preVerificationGas);
      } catch (err) {
        // If estimation fails, use default values (might overpay for gas)
        console.warn("Gas estimation failed, using defaults:", err);
      }

      // Return UserOp with bigints as strings (JSON serialization)
      return {
        userOp: {
          sender: userOp.sender,
          nonce: userOp.nonce.toString(),
          factory: userOp.factory,
          factoryData: userOp.factoryData,
          callData: userOp.callData,
          callGasLimit: userOp.callGasLimit.toString(),
          verificationGasLimit: userOp.verificationGasLimit.toString(),
          preVerificationGas: userOp.preVerificationGas.toString(),
          maxFeePerGas: userOp.maxFeePerGas.toString(),
          maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
          paymaster: userOp.paymaster,
          paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit?.toString() || null,
          paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit?.toString() || null,
          paymasterData: userOp.paymasterData,
        },
        credentialId: signingKey.credential_id, // Frontend needs this for signing
        isDeployed,
      };
    }),

  /**
   * Submit a signed UserOperation to the bundler
   *
   * After the frontend signs the UserOp with the passkey, it sends
   * the complete UserOp here. We:
   * 1. Convert to bundler format (hex strings for all numbers)
   * 2. Submit to Pimlico's bundler RPC
   * 3. Record in our database for tracking
   * 4. Return the userOpHash for polling
   *
   * The bundler will:
   * 1. Validate the UserOp (simulate on-chain)
   * 2. Add to their mempool
   * 3. Bundle with other UserOps when economically viable
   * 4. Submit to the EntryPoint contract
   */
  submitUserOp: publicProcedure
    .input(
      z.object({
        sender: addressSchema,
        to: addressSchema,
        value: z.string(),
        nonce: z.string(),
        factory: z.string().nullable(),
        factoryData: z.string().nullable(),
        callData: z.string(),
        callGasLimit: z.string(),
        verificationGasLimit: z.string(),
        preVerificationGas: z.string(),
        maxFeePerGas: z.string(),
        maxPriorityFeePerGas: z.string(),
        paymaster: z.string().nullable(),
        paymasterVerificationGasLimit: z.string().nullable(),
        paymasterPostOpGasLimit: z.string().nullable(),
        paymasterData: z.string().nullable(),
        signature: z.string(), // The passkey signature!
      })
    )
    .mutation(async ({ input }) => {
      // Convert back to our internal format
      const userOp: UserOperation = {
        sender: input.sender as Address,
        nonce: BigInt(input.nonce),
        factory: (input.factory as Address) || null,
        factoryData: (input.factoryData as Hex) || null,
        callData: input.callData as Hex,
        callGasLimit: BigInt(input.callGasLimit),
        verificationGasLimit: BigInt(input.verificationGasLimit),
        preVerificationGas: BigInt(input.preVerificationGas),
        maxFeePerGas: BigInt(input.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(input.maxPriorityFeePerGas),
        paymaster: (input.paymaster as Address) || null,
        paymasterVerificationGasLimit: input.paymasterVerificationGasLimit
          ? BigInt(input.paymasterVerificationGasLimit)
          : null,
        paymasterPostOpGasLimit: input.paymasterPostOpGasLimit
          ? BigInt(input.paymasterPostOpGasLimit)
          : null,
        paymasterData: (input.paymasterData as Hex) || null,
        signature: input.signature as Hex,
      };

      /**
       * Convert to bundler format (ERC-4337 v0.7 "unpacked")
       *
       * The bundler expects all numeric values as hex strings.
       * Factory and paymaster fields are only included if present.
       */
      const bundlerUserOp: UserOperationV07 = {
        sender: userOp.sender,
        nonce: toHex(userOp.nonce),
        callData: userOp.callData,
        callGasLimit: toHex(userOp.callGasLimit),
        verificationGasLimit: toHex(userOp.verificationGasLimit),
        preVerificationGas: toHex(userOp.preVerificationGas),
        maxFeePerGas: toHex(userOp.maxFeePerGas),
        maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
        signature: userOp.signature,
      };

      // Add factory fields if deploying
      if (userOp.factory) {
        bundlerUserOp.factory = userOp.factory;
        bundlerUserOp.factoryData = userOp.factoryData || "0x";
      }

      // Add paymaster fields if sponsored (not used in this simple version)
      if (userOp.paymaster) {
        bundlerUserOp.paymaster = userOp.paymaster;
        bundlerUserOp.paymasterVerificationGasLimit = toHex(userOp.paymasterVerificationGasLimit || 0n);
        bundlerUserOp.paymasterPostOpGasLimit = toHex(userOp.paymasterPostOpGasLimit || 0n);
        bundlerUserOp.paymasterData = userOp.paymasterData || "0x";
      }

      console.log("Submitting UserOp:", JSON.stringify(bundlerUserOp, null, 2));

      /**
       * Submit to bundler
       *
       * eth_sendUserOperation returns a userOpHash which uniquely identifies
       * this operation. We use it to poll for the receipt later.
       */
      const userOpHash = await sendUserOperation(bundlerUserOp);

      // Record in our database for history/tracking
      await createUserOp({
        userOpHash,
        sender: input.sender,
        to: input.to,
        value: input.value,
      });

      // If this was a deployment (initCode present), mark account as deployed
      if (input.factory) {
        await markAccountDeployed(input.sender);
      }

      return { userOpHash };
    }),

  /**
   * Wait for a UserOperation to be included on-chain
   *
   * After submitting, we poll the bundler until the UserOp is included.
   * This typically takes 2-10 seconds depending on network conditions.
   *
   * Returns the transaction hash and success status.
   * Note: A failed execution (e.g., transfer to invalid address) still
   * gets included on-chain - the user just paid gas for nothing.
   */
  waitForUserOp: publicProcedure
    .input(z.object({ userOpHash: z.string() }))
    .mutation(async ({ input }) => {
      try {
        // Poll bundler for receipt (2 second intervals, 60 second timeout)
        const receipt = await waitForUserOperation(input.userOpHash as Hex);

        // Update our database with the result
        await updateUserOpStatus(
          input.userOpHash,
          receipt.success ? "confirmed" : "failed",
          receipt.receipt.transactionHash
        );

        return {
          success: receipt.success,
          txHash: receipt.receipt.transactionHash,
          blockNumber: receipt.receipt.blockNumber,
        };
      } catch (err: any) {
        // Timeout or error - mark as failed
        await updateUserOpStatus(input.userOpHash, "failed");
        throw new Error(err.message || "Failed to confirm UserOp");
      }
    }),

  /**
   * Get UserOperation history for an address
   * Shows recent transactions (both as sender and recipient)
   * Enriched with usernames from smart_accounts
   */
  getUserOpHistory: publicProcedure
    .input(
      z.object({
        address: addressSchema,
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const ops = await getUserOpsByAddress(input.address, input.limit);

      const enriched = await Promise.all(
        ops.map(async (op) => {
          const [senderAccount, toAccount] = await Promise.all([
            getSmartAccount(op.sender),
            getSmartAccount(op.to_address),
          ]);
          return {
            ...op,
            sender_name: senderAccount?.name ?? null,
            to_name: toAccount?.name ?? null,
          };
        })
      );

      return enriched;
    }),
});
