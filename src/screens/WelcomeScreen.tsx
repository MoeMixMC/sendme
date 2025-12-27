/**
 * WelcomeScreen Component
 * =======================
 *
 * Initial landing screen for new and returning users.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Clean, focused design with clear CTAs
 * - Primary: Create Account (most users are new)
 * - Secondary: Login with Passkey (returning users)
 * - Brief value proposition text
 */

import React, { useState, useCallback } from "react";
import { Container } from "../components/layout";
import { Card, Button, StatusMessage } from "../components/ui";
import { useUIContext, useAccountContext } from "../context";
import { usePasskey } from "../hooks";
import { trpc } from "../trpc";
import type { SmartAccount } from "../types";

/**
 * WelcomeScreen - Landing page for unauthenticated users
 */
export function WelcomeScreen() {
  const { goToCreateAccount, goToDashboard, showError, showInfo, clearStatus, status } =
    useUIContext();
  const { setAccount, setLoading, isLoading } = useAccountContext();
  const { authenticate, isAuthenticating } = usePasskey();
  const [localLoading, setLocalLoading] = useState(false);

  /**
   * Handle login with passkey
   *
   * Flow:
   * 1. Trigger passkey authentication
   * 2. Get credential ID
   * 3. Look up account by credential ID
   * 4. Set account in context
   * 5. Navigate to dashboard
   */
  const handleLogin = useCallback(async () => {
    setLocalLoading(true);
    showInfo("Authenticate with your passkey...");

    try {
      // Step 1: Authenticate with passkey
      const credentialId = await authenticate();

      // Step 2: Look up account
      showInfo("Looking up account...");
      const result = await trpc.getAccountByCredentialId.query({ credentialId });

      if (!result) {
        throw new Error("Account not found. You may need to create a new account.");
      }

      // Step 3: Set account and navigate
      const account: SmartAccount = {
        address: result.address as `0x${string}`,
        name: result.name,
        deployed: result.deployed,
        credentialId,
      };

      setAccount(account);
      clearStatus();
      goToDashboard();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      showError(message);
    } finally {
      setLocalLoading(false);
    }
  }, [authenticate, setAccount, goToDashboard, showError, showInfo, clearStatus]);

  const isSubmitting = localLoading || isAuthenticating || isLoading;

  return (
    <Container>
      <div className="text-center mb-8 animate-fade-in">
        <h1 className="text-3xl font-bold mb-2">Digital Cash</h1>
        <p className="text-muted">Your gateway to the future of money</p>
      </div>

      <Card animate="fade-in-up" className="mb-6">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold mb-2">Welcome</h2>
          <p className="text-muted text-sm">
            Create a smart account secured by your device's biometrics.
            No passwords, no 12-word seed phrases - just you.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            variant="primary"
            onClick={goToCreateAccount}
            disabled={isSubmitting}
          >
            Create Account
          </Button>

          <Button
            variant="secondary"
            onClick={handleLogin}
            disabled={isSubmitting}
            loading={isSubmitting}
          >
            {isSubmitting ? "Logging in..." : "Login with Passkey"}
          </Button>
        </div>
      </Card>

      {/* Features highlight */}
      <div className="animate-fade-in-up stagger-2">
        <div className="grid grid-cols-1 gap-3 text-center text-sm text-muted">
          <div className="flex items-center justify-center gap-2">
            <span className="text-success">✓</span>
            <span>Secured by biometrics</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-success">✓</span>
            <span>No seed phrase to lose</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-success">✓</span>
            <span>Instant account creation</span>
          </div>
        </div>
      </div>

      {/* Status message */}
      {status && (
        <div className="mt-6">
          <StatusMessage
            type={status.type}
            message={status.message}
            onDismiss={status.type === "error" ? clearStatus : undefined}
          />
        </div>
      )}
    </Container>
  );
}
