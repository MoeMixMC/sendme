/**
 * CreateAccountScreen Component
 * =============================
 *
 * Multi-step account creation flow.
 *
 * STEPS:
 * 1. Username input
 * 2. Passkey creation (handled by browser)
 * 3. Account registration
 *
 * DESIGN DECISIONS
 * ----------------
 * - Step indicator shows progress
 * - Clear back button for navigation
 * - Animated transitions between steps
 * - Loading states with descriptive messages
 */

import React, { useState, useCallback } from "react";
import { Container } from "../components/layout";
import { Card, Button, StatusMessage, Spinner } from "../components/ui";
import { UsernameInput } from "../components/forms";
import { useUIContext, useAccountContext } from "../context";
import { usePasskey } from "../hooks";
import { trpc } from "../trpc";
import { validateUsername } from "../utils";
import type { SmartAccount, CreateAccountStep } from "../types";

/**
 * Step indicator component
 */
function StepIndicator({ currentStep }: { currentStep: CreateAccountStep }) {
  const steps: CreateAccountStep[] = ["username", "creating", "success"];
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="step-indicator">
      {steps.map((step, index) => (
        <div
          key={step}
          className={`step-dot ${
            index === currentIndex
              ? "step-dot-active"
              : index < currentIndex
              ? "step-dot-completed"
              : ""
          }`}
        />
      ))}
    </div>
  );
}

/**
 * CreateAccountScreen - Account creation flow
 */
export function CreateAccountScreen() {
  const { goToWelcome, goToDashboard, showError, showSuccess, clearStatus, status } =
    useUIContext();
  const { setAccount } = useAccountContext();
  const { create: createPasskey, isCreating } = usePasskey();

  const [step, setStep] = useState<CreateAccountStep>("username");
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  /**
   * Handle account creation
   *
   * Flow:
   * 1. Validate username
   * 2. Create passkey (triggers biometric prompt)
   * 3. Register account with backend
   * 4. Set account in context
   * 5. Navigate to dashboard
   */
  const handleCreateAccount = useCallback(async () => {
    // Validate username
    const validation = validateUsername(username);
    if (!validation.isValid) {
      showError(validation.error || "Invalid username");
      return;
    }

    setIsSubmitting(true);
    setStep("creating");
    clearStatus();

    try {
      // Step 1: Create passkey
      setStatusMessage("Creating passkey...");
      const passkey = await createPasskey(username);

      // Step 2: Register with backend
      setStatusMessage("Registering account...");
      const result = await trpc.createSmartAccount.mutate({
        username,
        credentialId: passkey.credentialId,
        publicKeyDer: passkey.publicKeyDer,
        publicKeyX: passkey.publicKeyX,
        publicKeyY: passkey.publicKeyY,
      });

      // Step 3: Set account and navigate
      const account: SmartAccount = {
        address: result.address as `0x${string}`,
        name: result.username,
        deployed: false,
        credentialId: passkey.credentialId,
      };

      setAccount(account);
      setStep("success");
      setStatusMessage("Account created successfully!");

      // Brief delay to show success, then navigate
      setTimeout(() => {
        goToDashboard();
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create account";
      showError(message);
      setStep("username");
    } finally {
      setIsSubmitting(false);
    }
  }, [username, createPasskey, setAccount, goToDashboard, showError, clearStatus]);

  const isLoading = isSubmitting || isCreating;
  const canSubmit = username.length >= 3 && !isLoading;

  return (
    <Container>
      <div className="text-center mb-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Create Account</h1>
      </div>

      <StepIndicator currentStep={step} />

      {/* Step 1: Username */}
      {step === "username" && (
        <Card animate="fade-in-up">
          <h2 className="text-lg font-semibold mb-2">Choose your username</h2>
          <p className="text-muted text-sm mb-4">
            This will be your unique identifier on the platform.
          </p>

          <UsernameInput
            value={username}
            onChange={setUsername}
            disabled={isLoading}
            autoFocus
          />

          <div className="mt-6 space-y-3">
            <Button
              variant="primary"
              onClick={handleCreateAccount}
              disabled={!canSubmit}
              loading={isLoading}
            >
              Continue with Passkey
            </Button>

            <Button
              variant="tertiary"
              onClick={goToWelcome}
              disabled={isLoading}
            >
              Back
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Creating */}
      {step === "creating" && (
        <Card animate="scale-in" className="text-center">
          <Spinner size="lg" className="mb-4" />
          <h2 className="text-lg font-semibold mb-2">Creating your account</h2>
          <p className="text-muted text-sm">{statusMessage}</p>
          <p className="text-xs text-dim mt-4">
            Follow your device's prompts to create a passkey
          </p>
        </Card>
      )}

      {/* Step 3: Success */}
      {step === "success" && (
        <Card animate="celebrate" className="text-center">
          <div className="text-4xl mb-4">✓</div>
          <h2 className="text-lg font-semibold mb-2 text-success">
            Account Created!
          </h2>
          <p className="text-muted text-sm">
            Your smart wallet is ready to use.
          </p>
        </Card>
      )}

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
