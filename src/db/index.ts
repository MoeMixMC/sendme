/**
 * Database Layer - PostgreSQL Storage for Smart Wallet
 * =====================================================
 *
 * This module handles all database operations for our ERC-4337 smart wallet.
 * We use PostgreSQL (via Bun's built-in Postgres client) to store:
 *
 * 1. SMART ACCOUNTS
 *    - Counterfactual addresses (computed before deployment)
 *    - Usernames (unique, human-readable identifiers)
 *    - Deployment status (tracks if the contract is on-chain)
 *
 * 2. SIGNING KEYS
 *    - P-256 public key coordinates (for address computation)
 *    - WebAuthn credential IDs (for identifying passkeys)
 *    - Key slots (accounts can have multiple signing keys)
 *
 * 3. USER OPERATIONS
 *    - UserOp hashes (for tracking submissions)
 *    - Transaction details (to, value, status)
 *    - Confirmation status (pending, confirmed, failed)
 *
 * Why Store This Data?
 * --------------------
 *
 * 1. LOOKUP BY CREDENTIAL ID
 *    When a user logs in with their passkey, we get the credential ID.
 *    We need to map this to their account address for the "login" flow.
 *
 * 2. REBUILD USER OPERATIONS
 *    To sign a UserOp, we need the public key coordinates. These come
 *    from the passkey creation and are stored here for later use.
 *
 * 3. TRANSACTION HISTORY
 *    Users expect to see their transaction history. We track UserOps
 *    and their confirmation status for the frontend to display.
 *
 * 4. USERNAME RESOLUTION
 *    For "send to @username" features, we need a mapping from
 *    usernames to addresses.
 *
 * Schema Design Notes:
 * --------------------
 *
 * - Addresses are stored lowercase for consistent comparison
 * - Public keys are stored as hex strings (0x-prefixed)
 * - Timestamps use PostgreSQL's CURRENT_TIMESTAMP
 * - Foreign keys link signing_keys to smart_accounts
 */

import { SQL } from "bun";

/**
 * Database Connection
 *
 * Bun's SQL client connects to PostgreSQL automatically.
 * Uses DATABASE_URL environment variable if set, otherwise
 * falls back to a local development database.
 *
 * In production, DATABASE_URL would point to your managed
 * PostgreSQL instance (e.g., Supabase, Neon, RDS).
 */
const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost:5432/daimo_simple";

export const sql = new SQL(DATABASE_URL);

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * Legacy User type - for EOA (Externally Owned Account) users
 * Kept for backwards compatibility with existing user/name features
 */
export interface User {
  id: number;
  address: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Smart Account - an ERC-4337 account controlled by a passkey
 *
 * The address is the counterfactual address computed via CREATE2.
 * The account contract may or may not be deployed on-chain yet.
 */
export interface SmartAccountRow {
  /** Counterfactual address (0x..., lowercase) */
  address: string;
  /** Unique username (lowercase) */
  name: string;
  /** Whether the account contract has been deployed */
  deployed: boolean;
  /** When the account was registered in our database */
  created_at: Date;
}

/**
 * Signing Key - P-256 public key from a passkey
 *
 * This is the key used to sign UserOperations. The corresponding
 * private key lives in the user's device secure hardware.
 */
export interface SigningKeyRow {
  id: number;
  /** Account this key belongs to */
  account_address: string;
  /**
   * Key slot in the account contract
   * DaimoAccountV2 supports multiple signing keys (up to 256)
   * Key slot 0 is the primary key set during account creation
   */
  key_slot: number;
  /** WebAuthn credential ID (base64url) - identifies this passkey */
  credential_id: string;
  /** DER-encoded public key (for storage/display) */
  public_key_der: string;
  /** X coordinate of P-256 key (32 bytes hex) - for smart contract */
  public_key_x: string;
  /** Y coordinate of P-256 key (32 bytes hex) - for smart contract */
  public_key_y: string;
  created_at: Date;
}

/**
 * UserOperation Record - tracks submitted ERC-4337 operations
 *
 * Each UserOp is identified by its hash, which is computed from all
 * the UserOp fields plus the EntryPoint address and chain ID.
 */
export interface UserOpRow {
  id: number;
  /** Unique hash of the UserOperation (0x..., 32 bytes) */
  user_op_hash: string;
  /** Account that submitted the UserOp */
  sender: string;
  /** Username of sender (from smart_accounts) */
  sender_name: string | null;
  /** Recipient of the transfer */
  to_address: string;
  /** Username of recipient (from smart_accounts) */
  to_name: string | null;
  /** Amount transferred (ETH as string, e.g., "0.01") */
  value: string;
  /** Current status: pending, confirmed, or failed */
  status: string;
  /** Transaction hash once included on-chain */
  tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

/**
 * Initialize Database Schema
 *
 * Creates all required tables if they don't exist.
 * This is called on server startup.
 *
 * Tables:
 * - users: Legacy EOA user accounts
 * - transactions: Legacy transaction history
 * - balance_cache: Short-lived balance cache
 * - smart_accounts: ERC-4337 account registry
 * - signing_keys: WebAuthn public keys
 * - user_ops: UserOperation tracking
 */
export async function initDB() {
  console.log("Initializing database...");

  // Legacy: Users table for EOA accounts
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      address TEXT UNIQUE NOT NULL,
      name TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Legacy: Transaction history for EOA transactions
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      hash TEXT UNIQUE NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      value TEXT NOT NULL,
      block_number BIGINT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Balance cache - reduces RPC calls
  // Updated balance expires after 1 minute (see getCachedBalance)
  await sql`
    CREATE TABLE IF NOT EXISTS balance_cache (
      address TEXT PRIMARY KEY,
      balance TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Indexes for common queries
  await sql`CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_address)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_address ON users(address)`;

  /**
   * Smart Accounts Table
   *
   * Stores ERC-4337 accounts created through our app.
   * - address: Counterfactual address (exists before deployment)
   * - name: Unique username for @mention functionality
   * - deployed: Tracks on-chain deployment status
   */
  await sql`
    CREATE TABLE IF NOT EXISTS smart_accounts (
      address TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      deployed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  /**
   * Signing Keys Table
   *
   * Stores the WebAuthn/passkey public keys for each account.
   *
   * Key fields:
   * - credential_id: How we identify which passkey to use for signing
   * - public_key_x/y: The P-256 coordinates needed for:
   *   1. Computing the counterfactual address
   *   2. Building initCode for first-time deployment
   * - key_slot: Accounts can have multiple keys (slot 0 is primary)
   *
   * The foreign key to smart_accounts ensures data integrity.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS signing_keys (
      id SERIAL PRIMARY KEY,
      account_address TEXT REFERENCES smart_accounts(address),
      key_slot INTEGER NOT NULL,
      credential_id TEXT NOT NULL,
      public_key_der TEXT NOT NULL,
      public_key_x TEXT NOT NULL,
      public_key_y TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_signing_keys_account ON signing_keys(account_address)`;

  /**
   * User Operations Table
   *
   * Tracks all UserOperations submitted through our app.
   *
   * Status flow:
   * - pending: Submitted to bundler, not yet on-chain
   * - confirmed: Successfully included in a block
   * - failed: Transaction reverted or timed out
   *
   * The tx_hash links to the actual on-chain transaction
   * containing the UserOp (bundlers batch multiple UserOps).
   */
  await sql`
    CREATE TABLE IF NOT EXISTS user_ops (
      id SERIAL PRIMARY KEY,
      user_op_hash TEXT UNIQUE NOT NULL,
      sender TEXT NOT NULL,
      to_address TEXT NOT NULL,
      value TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      tx_hash TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_user_ops_sender ON user_ops(sender)`;

  console.log("Database initialized");
}

// ============================================================
// USER OPERATIONS (Legacy - for EOA users)
// ============================================================

/**
 * Get user by Ethereum address
 * Returns null if not found
 */
export async function getUserByAddress(address: string): Promise<User | null> {
  const addr = address.toLowerCase();
  const result = await sql`
    SELECT * FROM users WHERE address = ${addr}
  `;
  const rows = Array.from(result) as User[];
  return rows[0] || null;
}

/**
 * Get user by username
 * Returns null if not found
 */
export async function getUserByName(name: string): Promise<User | null> {
  const n = name.toLowerCase();
  const result = await sql`
    SELECT * FROM users WHERE name = ${n}
  `;
  const rows = Array.from(result) as User[];
  return rows[0] || null;
}

/**
 * Set or update username for an address
 * Creates user if doesn't exist (upsert pattern)
 */
export async function setUsername(address: string, name: string) {
  const addr = address.toLowerCase();
  const n = name.toLowerCase();
  console.log("[DB] setUsername:", addr, "->", n);

  const result = await sql`
    INSERT INTO users (address, name)
    VALUES (${addr}, ${n})
    ON CONFLICT (address) DO UPDATE SET name = ${n}, updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const rows = Array.from(result);
  console.log("[DB] setUsername result:", rows);
  return rows[0];
}

/**
 * Search users by partial name or address match
 * Used for autocomplete in send flows
 */
export async function searchUsers(query: string, limit = 10) {
  const result = await sql`
    SELECT * FROM users
    WHERE name ILIKE ${"%" + query + "%"} OR address ILIKE ${"%" + query + "%"}
    LIMIT ${limit}
  `;
  return result;
}

// ============================================================
// TRANSACTION OPERATIONS (Legacy - for EOA transactions)
// ============================================================

/**
 * Record a transaction in the database
 * Used for transaction history feature
 */
export async function recordTransaction(tx: {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber?: bigint;
  status?: string;
}) {
  const result = await sql`
    INSERT INTO transactions (hash, from_address, to_address, value, block_number, status)
    VALUES (${tx.hash}, ${tx.from.toLowerCase()}, ${tx.to.toLowerCase()}, ${tx.value}, ${tx.blockNumber?.toString() || null}, ${tx.status || "pending"})
    ON CONFLICT (hash) DO UPDATE SET status = ${tx.status || "pending"}, block_number = ${tx.blockNumber?.toString() || null}
    RETURNING *
  `;
  return result[0];
}

/**
 * Get transaction history for an address
 * Returns both sent and received transactions
 */
export async function getTransactionsByAddress(address: string, limit = 50) {
  const result = await sql`
    SELECT * FROM transactions
    WHERE from_address = ${address.toLowerCase()} OR to_address = ${address.toLowerCase()}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result;
}

/**
 * Get a single transaction by hash
 */
export async function getTransactionByHash(hash: string) {
  const result = await sql`
    SELECT * FROM transactions WHERE hash = ${hash}
  `;
  return result[0] || null;
}

// ============================================================
// BALANCE CACHE
// ============================================================

/**
 * Cache a balance value
 * Reduces RPC calls for frequently-accessed balances
 */
export async function cacheBalance(address: string, balance: string) {
  await sql`
    INSERT INTO balance_cache (address, balance, updated_at)
    VALUES (${address.toLowerCase()}, ${balance}, CURRENT_TIMESTAMP)
    ON CONFLICT (address) DO UPDATE SET balance = ${balance}, updated_at = CURRENT_TIMESTAMP
  `;
}

/**
 * Get cached balance if fresh (< 1 minute old)
 * Returns null if cache miss or stale
 */
export async function getCachedBalance(address: string) {
  const result = await sql`
    SELECT * FROM balance_cache
    WHERE address = ${address.toLowerCase()}
    AND updated_at > NOW() - INTERVAL '1 minute'
  `;
  return result[0]?.balance || null;
}

// ============================================================
// SMART ACCOUNT OPERATIONS (ERC-4337)
// ============================================================

/**
 * Create a new smart account registration
 *
 * This is called after the user creates a passkey and we compute
 * the counterfactual address. The account contract is NOT deployed
 * yet - that happens on the first transaction.
 *
 * Creates two database entries:
 * 1. smart_accounts: The account itself
 * 2. signing_keys: The initial passkey public key
 */
export async function createSmartAccount(data: {
  address: string;
  name: string;
  credentialId: string;
  publicKeyDer: string;
  publicKeyX: string;
  publicKeyY: string;
}) {
  const addr = data.address.toLowerCase();
  const name = data.name.toLowerCase();

  // Insert the account record
  await sql`
    INSERT INTO smart_accounts (address, name)
    VALUES (${addr}, ${name})
  `;

  // Insert the signing key (slot 0 = primary key)
  await sql`
    INSERT INTO signing_keys (account_address, key_slot, credential_id, public_key_der, public_key_x, public_key_y)
    VALUES (${addr}, 0, ${data.credentialId}, ${data.publicKeyDer}, ${data.publicKeyX}, ${data.publicKeyY})
  `;

  return { address: addr, name };
}

/**
 * Get smart account by address
 * Returns null if not found
 */
export async function getSmartAccount(address: string): Promise<SmartAccountRow | null> {
  const addr = address.toLowerCase();
  const result = await sql`
    SELECT * FROM smart_accounts WHERE address = ${addr}
  `;
  const rows = Array.from(result) as SmartAccountRow[];
  return rows[0] || null;
}

/**
 * Get smart account by username
 * Used for @username resolution in send flows
 */
export async function getSmartAccountByName(name: string): Promise<SmartAccountRow | null> {
  const n = name.toLowerCase();
  const result = await sql`
    SELECT * FROM smart_accounts WHERE name = ${n}
  `;
  const rows = Array.from(result) as SmartAccountRow[];
  return rows[0] || null;
}

/**
 * Get signing key for an account
 *
 * @param address - Account address
 * @param keySlot - Key slot (default 0 = primary key)
 *
 * The signing key contains the public key coordinates needed to:
 * 1. Build initCode for deployment
 * 2. Identify which passkey to request for signing
 */
export async function getSigningKey(address: string, keySlot = 0): Promise<SigningKeyRow | null> {
  const addr = address.toLowerCase();
  const result = await sql`
    SELECT * FROM signing_keys
    WHERE account_address = ${addr} AND key_slot = ${keySlot}
  `;
  const rows = Array.from(result) as SigningKeyRow[];
  return rows[0] || null;
}

/**
 * Get account by WebAuthn credential ID
 *
 * This is the key function for "passwordless login":
 * 1. User authenticates with passkey
 * 2. We get the credential ID from WebAuthn
 * 3. We look up which account that credential belongs to
 * 4. User is now "logged in" to that account
 */
export async function getAccountByCredentialId(credentialId: string): Promise<(SmartAccountRow & { credential_id: string }) | null> {
  const result = await sql`
    SELECT sa.*, sk.credential_id
    FROM smart_accounts sa
    JOIN signing_keys sk ON sa.address = sk.account_address
    WHERE sk.credential_id = ${credentialId}
  `;
  const rows = Array.from(result) as (SmartAccountRow & { credential_id: string })[];
  return rows[0] || null;
}

/**
 * Mark account as deployed on-chain
 *
 * Called after the first transaction successfully deploys
 * the account contract via the initCode in the UserOp.
 */
export async function markAccountDeployed(address: string) {
  const addr = address.toLowerCase();
  await sql`
    UPDATE smart_accounts SET deployed = TRUE WHERE address = ${addr}
  `;
}

// ============================================================
// USEROP OPERATIONS
// ============================================================

/**
 * Create a UserOp record
 *
 * Called when a UserOp is submitted to the bundler.
 * Initial status is "pending".
 */
export async function createUserOp(data: {
  userOpHash: string;
  sender: string;
  to: string;
  value: string;
}): Promise<UserOpRow> {
  const result = await sql`
    INSERT INTO user_ops (user_op_hash, sender, to_address, value)
    VALUES (${data.userOpHash}, ${data.sender.toLowerCase()}, ${data.to.toLowerCase()}, ${data.value})
    RETURNING *
  `;
  const rows = Array.from(result) as UserOpRow[];
  return rows[0]!;
}

/**
 * Update UserOp status
 *
 * Called when:
 * - UserOp is confirmed on-chain (status = "confirmed", txHash set)
 * - UserOp fails or times out (status = "failed")
 */
export async function updateUserOpStatus(
  userOpHash: string,
  status: string,
  txHash?: string
): Promise<void> {
  await sql`
    UPDATE user_ops
    SET status = ${status}, tx_hash = ${txHash || null}, updated_at = CURRENT_TIMESTAMP
    WHERE user_op_hash = ${userOpHash}
  `;
}

/**
 * Get UserOp history for an address
 *
 * Returns UserOps where the address is either:
 * - The sender (account that initiated the transaction)
 * - The recipient (to_address of the transfer)
 */
export async function getUserOpsByAddress(address: string, limit = 20): Promise<UserOpRow[]> {
  const addr = address.toLowerCase();
  const result = await sql`
    SELECT * FROM user_ops
    WHERE sender = ${addr} OR to_address = ${addr}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return Array.from(result) as UserOpRow[];
}

/**
 * Get a single UserOp by hash
 * Returns null if not found
 */
export async function getUserOpByHash(hash: string): Promise<UserOpRow | null> {
  const result = await sql`
    SELECT * FROM user_ops WHERE user_op_hash = ${hash}
  `;
  const rows = Array.from(result) as UserOpRow[];
  return rows[0] || null;
}

/**
 * Search result with transaction context
 */
export interface SmartAccountSearchResult {
  address: string;
  name: string;
  lastTxType: 'sent' | 'received' | null;
  lastTxTime: string | null;
}

/**
 * Search smart accounts by username prefix
 * Includes last transaction context with the searcher
 */
export async function searchSmartAccounts(
  query: string,
  searcherAddress: string,
  limit = 5
): Promise<SmartAccountSearchResult[]> {
  const searcherAddr = searcherAddress.toLowerCase();
  const queryLower = query.toLowerCase();

  // Search for accounts matching the username prefix (excluding self)
  const accounts = await sql`
    SELECT address, name
    FROM smart_accounts
    WHERE name ILIKE ${queryLower + '%'}
    AND address != ${searcherAddr}
    ORDER BY name ASC
    LIMIT ${limit}
  `;

  const results: SmartAccountSearchResult[] = [];

  for (const account of accounts) {
    const addr = (account as any).address;

    // Find last transaction between searcher and this account
    const lastTx = await sql`
      SELECT
        CASE
          WHEN sender = ${searcherAddr} THEN 'sent'
          ELSE 'received'
        END as tx_type,
        created_at
      FROM user_ops
      WHERE (sender = ${searcherAddr} AND to_address = ${addr})
         OR (sender = ${addr} AND to_address = ${searcherAddr})
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const txRow = Array.from(lastTx)[0] as any;

    results.push({
      address: addr,
      name: (account as any).name,
      lastTxType: txRow?.tx_type || null,
      lastTxTime: txRow?.created_at ? new Date(txRow.created_at).toISOString() : null,
    });
  }

  return results;
}
