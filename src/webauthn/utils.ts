/**
 * WebAuthn Utility Functions - Key Format Conversions
 * ====================================================
 *
 * WebAuthn involves multiple cryptographic data formats. This module handles
 * conversions between them. Understanding these formats helps when debugging
 * signature verification issues.
 *
 * Key Formats Overview:
 * ---------------------
 *
 * 1. COSE Key (used in WebAuthn attestation)
 *    - CBOR-encoded key parameters
 *    - Contains: key type, algorithm, curve, x, y coordinates
 *    - Compact binary format from IETF COSE spec
 *
 * 2. SPKI (SubjectPublicKeyInfo) - returned by getPublicKey()
 *    - ASN.1 DER-encoded with algorithm identifier
 *    - Standard X.509 public key format
 *    - 91 bytes for P-256: header (26) + uncompressed point (65)
 *
 * 3. DER (Distinguished Encoding Rules)
 *    - ASN.1 encoding for public keys
 *    - 91 bytes: OID header + 04 || x || y
 *    - What we store in the database
 *
 * 4. Raw Coordinates (for smart contracts)
 *    - Just x and y as 32-byte values
 *    - What DaimoAccountV2 expects: bytes32[2]
 *
 * Signature Formats:
 * ------------------
 *
 * 1. DER Signature (from WebAuthn)
 *    - ASN.1 encoded: 0x30 [len] 0x02 [r-len] [r] 0x02 [s-len] [s]
 *    - Variable length (70-72 bytes typically)
 *
 * 2. Raw (r, s) (for smart contracts)
 *    - Two 32-byte integers
 *    - Must be in "low-S" canonical form
 */

import type { Hex } from "viem";

/**
 * Base64URL Encoding/Decoding
 *
 * WebAuthn uses base64url (RFC 4648) for binary data in JSON.
 * Different from regular base64:
 * - Uses - instead of +
 * - Uses _ instead of /
 * - No padding (= removed)
 *
 * This is URL-safe and works in credential IDs.
 */
export function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(str: string): Uint8Array {
  // Convert base64url to base64
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding back
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  // Decode
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert bytes to hex string
 * Standard format for Ethereum (0x prefixed)
 */
export function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Convert hex string to bytes
 * Handles both 0x-prefixed and raw hex
 */
export function hexToBytes(hex: Hex): Uint8Array {
  const str = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(str.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(str.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * DER Prefix for P-256 Public Keys
 *
 * This is the ASN.1 header that identifies:
 * - Algorithm: EC (Elliptic Curve)
 * - Curve: P-256 (prime256v1 / secp256r1)
 * - Key format: Uncompressed point (04 || x || y)
 *
 * Breakdown:
 * 30 59                 - SEQUENCE, 89 bytes
 *   30 13               - SEQUENCE, 19 bytes (AlgorithmIdentifier)
 *     06 07 2a8648ce3d0201  - OID 1.2.840.10045.2.1 (ecPublicKey)
 *     06 08 2a8648ce3d030107 - OID 1.2.840.10045.3.1.7 (prime256v1)
 *   03 42               - BIT STRING, 66 bytes
 *     00                - 0 unused bits
 *     04 [x:32] [y:32]  - Uncompressed point
 */
const DER_PREFIX = "3059301306072a8648ce3d020106082a8648ce3d03010703420004";

/**
 * Convert raw P-256 public key to DER format
 *
 * Raw format: 64 bytes (x || y)
 * DER format: 91 bytes (prefix + 04 + x + y)
 *
 * @param rawKey - 64 bytes: x coordinate || y coordinate
 * @returns DER-encoded public key (hex)
 */
export function rawKeyToDer(rawKey: Uint8Array): Hex {
  if (rawKey.length !== 64) {
    throw new Error(`Expected 64 bytes, got ${rawKey.length}`);
  }
  return `0x${DER_PREFIX}${bytesToHex(rawKey).slice(2)}`;
}

/**
 * Convert DER public key to contract-friendly [x, y] format
 *
 * Smart contracts like DaimoAccountV2 expect the public key as
 * two bytes32 values: [x, y] coordinates of the P-256 point.
 *
 * @param derKey - DER-encoded public key (hex)
 * @returns [x, y] as hex strings (32 bytes each)
 */
export function derKeyToXY(derKey: Hex): [Hex, Hex] {
  const prefix = `0x${DER_PREFIX}`;
  if (!derKey.startsWith(prefix)) {
    throw new Error("Invalid DER key format");
  }
  // After the prefix, we have 64 hex chars (32 bytes x, 32 bytes y)
  const pubKey = derKey.slice(prefix.length);
  if (pubKey.length !== 128) { // 64 bytes = 128 hex chars
    throw new Error("Invalid public key length");
  }
  const x = `0x${pubKey.slice(0, 64)}` as Hex;
  const y = `0x${pubKey.slice(64)}` as Hex;
  return [x, y];
}

/**
 * Parse COSE Key from WebAuthn attestation
 *
 * COSE (CBOR Object Signing and Encryption) is used by WebAuthn
 * to encode public keys in the attestation object.
 *
 * For P-256 (ES256), the COSE key contains:
 * - kty (key type) = 2 (EC)
 * - alg (algorithm) = -7 (ES256)
 * - crv (curve) = 1 (P-256)
 * - x = 32-byte X coordinate
 * - y = 32-byte Y coordinate
 *
 * CBOR labels use negative integers for COSE-defined keys:
 * - -1 = crv (curve)
 * - -2 = x coordinate
 * - -3 = y coordinate
 *
 * @param coseKey - CBOR-encoded COSE key bytes
 * @returns x and y coordinates as byte arrays
 */
export function parseCoseKey(coseKey: Uint8Array): { x: Uint8Array; y: Uint8Array } {
  let offset = 0;

  // Read CBOR map header
  // Format: 0xA0 + number of items (for small maps)
  const mapHeader = coseKey[offset++]!;
  if ((mapHeader & 0xe0) !== 0xa0) {
    throw new Error("Expected CBOR map");
  }
  const mapSize = mapHeader & 0x1f;

  let x: Uint8Array | null = null;
  let y: Uint8Array | null = null;

  // Iterate through map entries
  for (let i = 0; i < mapSize; i++) {
    // Read key (CBOR integer)
    const keyByte = coseKey[offset++]!;
    let key: number;

    if ((keyByte & 0xe0) === 0x20) {
      // Negative integer: -1 - value
      key = -1 - (keyByte & 0x1f);
    } else if ((keyByte & 0xe0) === 0x00) {
      // Positive integer
      key = keyByte & 0x1f;
    } else {
      throw new Error(`Unexpected CBOR key type: ${keyByte}`);
    }

    // Read value
    const valueByte = coseKey[offset++]!;

    if ((valueByte & 0xe0) === 0x40) {
      // Byte string with length in low bits
      const len = valueByte & 0x1f;
      const value = coseKey.slice(offset, offset + len);
      offset += len;

      if (key === -2) x = value; // x coordinate
      if (key === -3) y = value; // y coordinate
    } else if ((valueByte & 0xe0) === 0x00) {
      // Positive integer (e.g., kty=2) - skip
    } else if ((valueByte & 0xe0) === 0x20) {
      // Negative integer (e.g., alg=-7) - skip
    } else if (valueByte === 0x58) {
      // Byte string with 1-byte length prefix
      const len = coseKey[offset++]!;
      const value = coseKey.slice(offset, offset + len);
      offset += len;

      if (key === -2) x = value;
      if (key === -3) y = value;
    } else {
      throw new Error(`Unexpected CBOR value type: ${valueByte}`);
    }
  }

  if (!x || !y) {
    throw new Error("Could not find x and y coordinates in COSE key");
  }

  return { x, y };
}

/**
 * Parse attestation object to extract public key
 *
 * The attestation object is returned when creating a passkey.
 * It's CBOR-encoded with this structure:
 *
 * {
 *   "fmt": "none",              // Attestation format
 *   "attStmt": {},              // Attestation statement (empty for "none")
 *   "authData": <bytes>         // Authenticator data
 * }
 *
 * The authData contains:
 * - rpIdHash (32 bytes) - SHA-256 of the relying party ID
 * - flags (1 byte) - User present, user verified, attested credential, etc.
 * - signCount (4 bytes) - Signature counter
 * - attestedCredentialData (variable) - Only present if AT flag is set
 *   - aaguid (16 bytes) - Authenticator identifier
 *   - credIdLen (2 bytes) - Length of credential ID
 *   - credId (credIdLen bytes) - Credential ID
 *   - credentialPublicKey (variable) - COSE-encoded public key
 *
 * This function navigates through the CBOR structure to extract
 * the public key coordinates.
 *
 * @param attestationObject - Raw attestation object from WebAuthn
 * @returns DER-encoded public key and [x, y] coordinates
 */
export function parseAttestationObject(attestationObject: ArrayBuffer): {
  publicKeyDer: Hex;
  publicKeyXY: [Hex, Hex];
} {
  const bytes = new Uint8Array(attestationObject);

  let offset = 0;

  // Skip CBOR map header
  offset++;

  // Find authData in the map
  let authDataOffset = -1;
  for (let i = 0; i < 3; i++) {
    // Read text string key
    const keyLen = bytes[offset++]! & 0x1f;
    const key = new TextDecoder().decode(bytes.slice(offset, offset + keyLen));
    offset += keyLen;

    if (key === "authData") {
      // authData is a byte string - check length encoding
      if (bytes[offset] === 0x58) {
        // 1-byte length
        offset++;
        authDataOffset = offset + 1;
        break;
      } else if (bytes[offset] === 0x59) {
        // 2-byte length
        offset++;
        authDataOffset = offset + 2;
        break;
      }
    } else {
      // Skip this value
      const valueByte = bytes[offset++]!;
      if ((valueByte & 0xe0) === 0x60) {
        // Text string
        offset += valueByte & 0x1f;
      } else if (valueByte === 0x78) {
        // Text string with 1-byte length
        offset += bytes[offset++]!;
      } else if ((valueByte & 0xe0) === 0xa0) {
        // Empty map (e.g., attStmt)
      } else if (valueByte === 0x58) {
        // Byte string with 1-byte length
        offset += bytes[offset++]!;
      } else if (valueByte === 0x59) {
        // Byte string with 2-byte length
        const len = (bytes[offset]! << 8) | bytes[offset + 1]!;
        offset += 2 + len;
      }
    }
  }

  if (authDataOffset === -1) {
    throw new Error("Could not find authData in attestation");
  }

  // Parse authData structure
  // rpIdHash (32) + flags (1) + signCount (4) = 37 bytes until attestedCredentialData
  const attestedCredDataOffset = authDataOffset + 37;

  // attestedCredentialData: aaguid (16) + credIdLen (2 big-endian)
  const credIdLen = (bytes[attestedCredDataOffset + 16]! << 8) | bytes[attestedCredDataOffset + 17]!;

  // COSE key starts after: aaguid (16) + credIdLen (2) + credId (credIdLen)
  const coseKeyOffset = attestedCredDataOffset + 18 + credIdLen;
  const coseKey = bytes.slice(coseKeyOffset);

  // Parse the COSE key to get x, y coordinates
  const { x, y } = parseCoseKey(coseKey);

  // Combine into raw key format (64 bytes: x || y)
  const rawKey = new Uint8Array(64);
  rawKey.set(x, 0);
  rawKey.set(y, 32);

  // Convert to DER format and extract coordinates
  const publicKeyDer = rawKeyToDer(rawKey);
  const publicKeyXY = derKeyToXY(publicKeyDer);

  return { publicKeyDer, publicKeyXY };
}
