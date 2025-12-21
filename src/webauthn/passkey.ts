/**
 * WebAuthn Passkey Integration for Smart Account Authentication
 * ==============================================================
 *
 * This module implements passkey (WebAuthn) authentication for our ERC-4337 smart accounts.
 * Instead of managing private keys or seed phrases, users authenticate with biometrics
 * (Face ID, Touch ID, fingerprint) or hardware security keys.
 *
 * Why Passkeys for Crypto Wallets?
 * --------------------------------
 * Traditional crypto wallets require users to:
 * - Write down 12-24 word seed phrases
 * - Never lose the paper (or it's gone forever)
 * - Never let anyone see it (or funds get stolen)
 *
 * Passkeys solve this by:
 * - Storing keys in device's secure hardware (Secure Enclave, TPM)
 * - Using biometric authentication (something you ARE, not something you KNOW)
 * - Syncing across devices via iCloud Keychain or Google Password Manager
 * - Never exposing the private key to JavaScript or the network
 *
 * How It Works with ERC-4337
 * --------------------------
 * 1. User creates account → Device generates P-256 keypair in secure hardware
 * 2. We get the PUBLIC key only → Used to compute smart account address
 * 3. User sends transaction → Passkey signs the UserOp hash with PRIVATE key
 * 4. Smart contract verifies → P-256 signature validation on-chain
 *
 * The private key NEVER leaves the secure hardware. Even if your computer
 * is compromised, the attacker cannot extract the signing key.
 *
 * P-256 (secp256r1) vs secp256k1
 * ------------------------------
 * Bitcoin/Ethereum EOAs use secp256k1. WebAuthn uses P-256 (secp256r1).
 * Different curves, same security level (~128 bits). DaimoAccountV2 has a
 * P-256 signature verifier built-in, so we can use passkeys directly.
 */

import type { Hex } from "viem";
import {
  base64UrlEncode,
  base64UrlDecode,
  parseAttestationObject,
  bytesToHex,
  rawKeyToDer,
  derKeyToXY,
} from "./utils";

/**
 * Passkey Credential - returned after creating a new passkey
 *
 * This contains the public key data needed to:
 * 1. Compute the smart account address (publicKeyX, publicKeyY)
 * 2. Store for future signature verification (publicKeyDer)
 * 3. Identify which passkey to use for signing (credentialId)
 */
export interface PasskeyCredential {
  /** Base64URL-encoded credential ID - unique identifier for this passkey */
  credentialId: string;
  /** DER-encoded public key - standard format for storage */
  publicKeyDer: Hex;
  /** X coordinate of P-256 public key (32 bytes) - for smart contract */
  publicKeyX: Hex;
  /** Y coordinate of P-256 public key (32 bytes) - for smart contract */
  publicKeyY: Hex;
}

/**
 * Passkey Signature - returned after signing with a passkey
 *
 * WebAuthn signatures include additional data beyond just (r, s):
 * - authenticatorData: Device metadata (flags, sign counter)
 * - clientDataJSON: What the browser thinks is being signed
 *
 * The smart contract reconstructs and hashes these to verify the signature.
 */
export interface PasskeySignature {
  /** Raw authenticator data (37+ bytes) - includes RP ID hash, flags, counter */
  authenticatorData: Uint8Array;
  /** JSON containing challenge, origin, type - browser's view of the request */
  clientDataJSON: string;
  /** r value of ECDSA signature (32 bytes as bigint) */
  r: bigint;
  /** s value of ECDSA signature, normalized to low-S form (32 bytes as bigint) */
  s: bigint;
}

/**
 * Create a new passkey for a user
 *
 * This triggers the browser's WebAuthn flow:
 * 1. Browser shows passkey creation dialog
 * 2. User authenticates (Face ID, Touch ID, PIN, etc.)
 * 3. Device generates P-256 keypair in secure hardware
 * 4. We receive the public key (private key stays in hardware)
 *
 * The passkey is bound to:
 * - This website (rpId = hostname)
 * - This user (username)
 * - This device (or synced via cloud if supported)
 *
 * @param username - Username to associate with the passkey (displayed to user)
 * @returns Credential data including public key coordinates
 */
export async function createPasskey(username: string): Promise<PasskeyCredential> {
  // Random challenge - not cryptographically important for registration,
  // but WebAuthn requires it. The important part is the public key we get back.
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  // Request passkey creation from the browser
  // This will show a system dialog (Face ID, Touch ID, etc.)
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      /**
       * Relying Party (RP) - identifies our website
       * The passkey will only work on this domain.
       * This prevents phishing - a fake site can't use passkeys from the real site.
       */
      rp: {
        id: window.location.hostname,
        name: "Daimo Simple",
      },
      /**
       * User info - helps users identify this passkey in their password manager
       * The id must be unique per user (we use the username bytes)
       */
      user: {
        id: new TextEncoder().encode(username),
        name: username,
        displayName: username,
      },
      /**
       * Key algorithm - we MUST use ES256 (P-256 / secp256r1)
       * alg: -7 is the COSE algorithm ID for ES256
       * This matches DaimoAccountV2's P-256 signature verifier
       */
      pubKeyCredParams: [{ alg: -7, type: "public-key" }], // ES256 (P-256)
      /**
       * Authenticator preferences:
       * - residentKey: "preferred" - store on device if possible (for passwordless)
       * - userVerification: "required" - always require biometric/PIN
       */
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      /**
       * Attestation: "none" - we don't need proof of which authenticator was used
       * This improves privacy and compatibility. For a wallet, we only care
       * about the public key, not which vendor made the security hardware.
       */
      attestation: "none",
    },
  })) as PublicKeyCredential;

  if (!credential) {
    throw new Error("Failed to create credential");
  }

  const response = credential.response as AuthenticatorAttestationResponse;

  // Extract the public key from the attestation response
  // Modern browsers provide getPublicKey() which is simpler and more reliable
  let publicKeyDer: Hex;
  let publicKeyXY: [Hex, Hex];

  if (typeof response.getPublicKey === "function") {
    // Modern approach: use getPublicKey() API (Chrome 67+, Safari 14+, Firefox 60+)
    const spkiKey = response.getPublicKey();
    if (!spkiKey) {
      throw new Error("Failed to get public key from response");
    }

    /**
     * The key is in SPKI (SubjectPublicKeyInfo) format:
     * - 26 byte header (ASN.1 structure identifying P-256)
     * - 65 byte uncompressed point (04 || x || y)
     *
     * We extract x and y to:
     * 1. Store as DER format (standard encoding)
     * 2. Convert to [x, y] for the smart contract
     */
    const spkiBytes = new Uint8Array(spkiKey);
    const rawPoint = spkiBytes.slice(-65); // Last 65 bytes
    if (rawPoint[0] !== 0x04) {
      throw new Error("Expected uncompressed point format");
    }
    const x = rawPoint.slice(1, 33);  // 32 bytes
    const y = rawPoint.slice(33, 65); // 32 bytes

    // Combine into raw key format (64 bytes: x || y)
    const rawKey = new Uint8Array(64);
    rawKey.set(x, 0);
    rawKey.set(y, 32);

    // Convert to DER and extract coordinates
    publicKeyDer = rawKeyToDer(rawKey);
    publicKeyXY = derKeyToXY(publicKeyDer);
  } else {
    // Fallback: parse the attestation object manually (older browsers)
    const parsed = parseAttestationObject(response.attestationObject);
    publicKeyDer = parsed.publicKeyDer;
    publicKeyXY = parsed.publicKeyXY;
  }

  return {
    // Credential ID uniquely identifies this passkey - needed for signing later
    credentialId: base64UrlEncode(credential.rawId),
    publicKeyDer,
    publicKeyX: publicKeyXY[0],
    publicKeyY: publicKeyXY[1],
  };
}

/**
 * Sign a challenge with an existing passkey
 *
 * This triggers the browser's WebAuthn authentication flow:
 * 1. Browser shows passkey selection (if multiple exist)
 * 2. User authenticates (Face ID, Touch ID, etc.)
 * 3. Device signs the challenge with the PRIVATE key
 * 4. We receive the signature (private key never exposed)
 *
 * For ERC-4337, the challenge is: validUntil (6 bytes) + userOpHash (32 bytes)
 * This binds the signature to a specific operation and optional expiry time.
 *
 * @param challenge - Data to sign (typically validUntil + userOpHash)
 * @param credentialId - Which passkey to use (base64url encoded)
 * @returns Signature data for the smart contract
 */
export async function signWithPasskey(
  challenge: Uint8Array,
  credentialId: string
): Promise<PasskeySignature> {
  // Request signature from the passkey
  // Browser will show authentication dialog
  const credential = (await navigator.credentials.get({
    publicKey: {
      // The challenge gets base64url-encoded into clientDataJSON
      // Smart contract will reconstruct and verify this
      challenge,
      // Specify which passkey to use (user won't be prompted to choose)
      allowCredentials: [
        {
          type: "public-key",
          id: base64UrlDecode(credentialId),
        },
      ],
      // Always require biometric/PIN verification
      userVerification: "required",
    },
  })) as PublicKeyCredential;

  if (!credential) {
    throw new Error("Failed to get credential");
  }

  const response = credential.response as AuthenticatorAssertionResponse;

  /**
   * Parse the DER-encoded signature to extract (r, s) values
   *
   * ECDSA signatures consist of two 256-bit integers (r, s).
   * WebAuthn returns them in DER format (ASN.1 encoding).
   * The smart contract expects raw (r, s) as uint256 values.
   */
  const signature = new Uint8Array(response.signature);
  const { r, s } = parseDerSignature(signature);

  return {
    // authenticatorData contains: rpIdHash (32) + flags (1) + signCount (4)
    // The smart contract uses this to reconstruct what was signed
    authenticatorData: new Uint8Array(response.authenticatorData),
    // clientDataJSON contains: type, challenge (base64url), origin, crossOrigin
    // The smart contract parses this to extract and verify the challenge
    clientDataJSON: new TextDecoder().decode(response.clientDataJSON),
    r,
    s,
  };
}

/**
 * Parse a DER-encoded ECDSA signature to (r, s) integers
 *
 * DER Format:
 * 0x30 [total-length] 0x02 [r-length] [r-bytes] 0x02 [s-length] [s-bytes]
 *
 * The lengths vary because DER uses signed integers:
 * - If high bit is set, a 0x00 prefix is added (to keep it positive)
 * - Leading zeros are stripped (except for the sign byte)
 *
 * We need to:
 * 1. Extract r and s bytes
 * 2. Pad/trim to exactly 32 bytes each
 * 3. Normalize s to "low-S" form (required by contracts)
 *
 * @param der - DER-encoded signature bytes
 * @returns r and s as BigInt values
 */
function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } {
  // Verify DER SEQUENCE tag
  if (der[0] !== 0x30) {
    throw new Error("Invalid DER signature");
  }

  let offset = 2; // Skip 0x30 and length byte

  // Parse r INTEGER
  if (der[offset++] !== 0x02) {
    throw new Error("Expected integer tag for r");
  }
  const rLen = der[offset++]!;
  let rBytes = der.slice(offset, offset + rLen);
  offset += rLen;

  // Parse s INTEGER
  if (der[offset++] !== 0x02) {
    throw new Error("Expected integer tag for s");
  }
  const sLen = der[offset++]!;
  let sBytes = der.slice(offset, offset + sLen);

  // Remove leading zero (DER uses signed integers, adds 0x00 if high bit set)
  if (rBytes[0] === 0x00) rBytes = rBytes.slice(1);
  if (sBytes[0] === 0x00) sBytes = sBytes.slice(1);

  // Pad to exactly 32 bytes (P-256 uses 256-bit integers)
  const rPadded = new Uint8Array(32);
  const sPadded = new Uint8Array(32);
  rPadded.set(rBytes, 32 - rBytes.length);
  sPadded.set(sBytes, 32 - sBytes.length);

  const r = BigInt(bytesToHex(rPadded));
  let s = BigInt(bytesToHex(sPadded));

  /**
   * Normalize s to "low-S" form
   *
   * ECDSA has signature malleability: both (r, s) and (r, n-s) are valid.
   * Ethereum and many contracts only accept "low-S" where s <= n/2.
   * This prevents transaction malleability attacks.
   *
   * n is the order of the P-256 curve (number of points in the group)
   */
  const n = BigInt(
    "0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551"
  );
  if (s > n / 2n) {
    s = n - s;
  }

  return { r, s };
}
