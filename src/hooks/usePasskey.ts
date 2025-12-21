/**
 * usePasskey - WebAuthn Integration Hook
 * ======================================
 *
 * ABSTRACTION LAYER
 * -----------------
 * This hook wraps the low-level WebAuthn API to provide:
 * 1. Simpler interface for components
 * 2. Loading states during biometric prompts
 * 3. Error handling with user-friendly messages
 *
 * Components just call `create(username)` or `authenticate()`
 * without knowing about WebAuthn, CBOR, or DER encoding.
 *
 * PASSKEY SECURITY MODEL
 * ----------------------
 * - Private keys never leave the device's secure hardware
 * - Every operation requires user verification (biometric/PIN)
 * - Even malware can't sign without user interaction
 * - No passwords or seed phrases to steal
 */

import { useState, useCallback } from "react";
import {
  createPasskey,
  type PasskeyCredential,
} from "../webauthn/passkey";

interface UsePasskeyReturn {
  /** Create a new passkey for account registration */
  create: (username: string) => Promise<PasskeyCredential>;
  /** Authenticate with existing passkey (returns credential ID) */
  authenticate: () => Promise<string>;
  /** Whether currently creating a passkey */
  isCreating: boolean;
  /** Whether currently authenticating */
  isAuthenticating: boolean;
  /** Last error, if any */
  error: string | null;
  /** Clear the error */
  clearError: () => void;
}

/**
 * usePasskey - Manage passkey creation and authentication
 */
export function usePasskey(): UsePasskeyReturn {
  const [isCreating, setIsCreating] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a new passkey
   *
   * This triggers the browser's WebAuthn flow:
   * - User sees a prompt to create a passkey
   * - User authenticates (Face ID, Touch ID, PIN, etc.)
   * - Device generates a P-256 keypair in secure hardware
   * - We receive the public key (private key stays in device)
   */
  const create = useCallback(async (username: string): Promise<PasskeyCredential> => {
    setIsCreating(true);
    setError(null);

    try {
      const credential = await createPasskey(username);
      return credential;
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : "Failed to create passkey";
      setError(message);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }, []);

  /**
   * Authenticate with an existing passkey
   *
   * This triggers the browser's passkey selection:
   * - User sees available passkeys for this site
   * - User selects one and authenticates
   * - We receive the credential ID to identify the account
   */
  const authenticate = useCallback(async (): Promise<string> => {
    setIsAuthenticating(true);
    setError(null);

    try {
      // Request passkey authentication
      const credential = (await navigator.credentials.get({
        publicKey: {
          // Random challenge - just for this authentication
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: window.location.hostname,
          userVerification: "required",
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error("No passkey selected");
      }

      // Convert credential ID to base64url format
      const credentialId = btoa(
        String.fromCharCode(...new Uint8Array(credential.rawId))
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      return credentialId;
    } catch (err) {
      let message = "Authentication failed";

      if (err instanceof Error) {
        // User-friendly error messages
        if (err.name === "NotAllowedError") {
          message = "Passkey authentication was cancelled";
        } else if (err.name === "SecurityError") {
          message = "Passkey not available on this device";
        } else {
          message = err.message;
        }
      }

      setError(message);
      throw new Error(message);
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    create,
    authenticate,
    isCreating,
    isAuthenticating,
    error,
    clearError,
  };
}
