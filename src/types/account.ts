/**
 * Account Type Definitions
 * ========================
 *
 * TYPE-DRIVEN DEVELOPMENT
 * -----------------------
 * We define types FIRST, then implement. This ensures:
 * 1. Clear contracts between components
 * 2. IDE autocomplete and error detection
 * 3. Self-documenting code
 *
 * These types represent the core account model for our smart wallet.
 * They're used across the entire frontend: context, hooks, components.
 */

/**
 * SmartAccount - The core account model
 *
 * This represents a user's ERC-4337 smart account.
 * Stored in localStorage and React context for the current session.
 *
 * KEY CONCEPT: Counterfactual Deployment
 * The address is computed BEFORE the contract is deployed on-chain.
 * Users can receive funds immediately. The first transaction deploys
 * the account automatically via initCode in the UserOperation.
 */
export interface SmartAccount {
  /** The counterfactual address (same before and after deployment) */
  address: `0x${string}`;
  /** Human-readable username (unique in our system) */
  name: string;
  /** Whether the account contract has been deployed on-chain */
  deployed: boolean;
  /**
   * WebAuthn credential ID (base64url)
   * This identifies which passkey to use for signing.
   * The passkey itself is stored in device secure hardware.
   */
  credentialId: string;
}

/**
 * PasskeyCredential - Result of creating a new passkey
 *
 * When the user creates a passkey (Face ID, Touch ID, etc.),
 * the device generates a P-256 keypair. The private key stays
 * in secure hardware; we receive the public key coordinates.
 */
export interface PasskeyCredential {
  /** Unique identifier for this passkey (base64url) */
  credentialId: string;
  /** Full DER-encoded public key (for storage) */
  publicKeyDer: `0x${string}`;
  /** X coordinate of the P-256 public key (for on-chain verification) */
  publicKeyX: `0x${string}`;
  /** Y coordinate of the P-256 public key (for on-chain verification) */
  publicKeyY: `0x${string}`;
}

/**
 * CreateAccountInput - Data needed to create a new account
 */
export interface CreateAccountInput {
  username: string;
  credential: PasskeyCredential;
}

/**
 * CreateAccountResult - Server response when creating an account
 */
export interface CreateAccountResult {
  success: boolean;
  address: string;
  username: string;
}

/**
 * AccountLookupResult - Server response when looking up an account
 */
export interface AccountLookupResult {
  address: string;
  name: string;
  deployed: boolean;
}
