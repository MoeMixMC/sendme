/**
 * UI State Type Definitions
 * =========================
 *
 * These types define the UI state machine and component props.
 *
 * SEPARATION OF CONCERNS
 * ----------------------
 * UI types are separate from business types (account, transaction).
 * This allows:
 * 1. UI components to be reused with different business logic
 * 2. Clearer understanding of what's "UI" vs "data"
 * 3. Easier testing of UI components in isolation
 */

/**
 * Screen - The current screen/view in the app
 *
 * We use a simple state machine instead of a router because:
 * 1. Single-page app with no URL routing needed
 * 2. Simpler mental model for a wallet app
 * 3. No need for deep linking (yet)
 */
export type Screen = "welcome" | "createAccount" | "dashboard";

/**
 * StatusType - Categories of status messages
 */
export type StatusType = "success" | "error" | "info";

/**
 * Status - A status message to display to the user
 *
 * Status messages provide feedback during async operations.
 * They auto-dismiss or can be manually cleared.
 */
export interface Status {
  type: StatusType;
  message: string;
}

/**
 * SendState - State machine for the send transaction flow
 *
 * WHY A STATE MACHINE?
 * --------------------
 * Sending a transaction has multiple distinct phases.
 * Using a discriminated union (status field) makes
 * "impossible states impossible":
 *
 * - Can't have a txHash without being in 'success' status
 * - Can't have an error message without being in 'error' status
 * - TypeScript enforces correct handling of each state
 *
 * This pattern is called "making illegal states unrepresentable"
 */
export type SendState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "preparing" }
  | { status: "signing" }
  | { status: "submitting" }
  | { status: "confirming"; userOpHash: string }
  | { status: "success"; txHash: string }
  | { status: "error"; message: string };

/**
 * CreateAccountStep - Steps in the account creation flow
 */
export type CreateAccountStep = "username" | "creating" | "success";

/**
 * ButtonVariant - Visual variants for buttons
 *
 * Using semantic names (primary, secondary) instead of
 * colors (blue, gray) allows for theme changes without
 * updating component code.
 */
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";

/**
 * ButtonSize - Size variants for buttons
 */
export type ButtonSize = "sm" | "md" | "lg";

/**
 * ValidationState - Result of input validation
 *
 * Used by form inputs to show validation feedback.
 */
export interface ValidationState {
  isValid: boolean;
  error: string | null;
}

/**
 * InputVariant - Visual states for inputs
 */
export type InputVariant = "default" | "error" | "success";
