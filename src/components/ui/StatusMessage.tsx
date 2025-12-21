/**
 * StatusMessage Component
 * =======================
 *
 * Displays success, error, or info messages to the user.
 *
 * DESIGN DECISIONS
 * ----------------
 * - Color-coded by type for quick recognition
 * - Optional dismiss button
 * - Subtle border + background for visibility without being jarring
 * - Animated entrance for attention
 */

import React from "react";
import type { StatusType } from "../../types";

interface StatusMessageProps {
  /** Type of status message */
  type: StatusType;
  /** The message to display */
  message: string;
  /** Optional callback when dismissed */
  onDismiss?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get icon for each status type
 */
function getStatusIcon(type: StatusType): string {
  switch (type) {
    case "success":
      return "✓";
    case "error":
      return "✕";
    case "info":
      return "ℹ";
    default:
      return "";
  }
}

/**
 * StatusMessage - User feedback display
 *
 * @example
 * <StatusMessage type="success" message="Transaction confirmed!" />
 *
 * @example
 * <StatusMessage
 *   type="error"
 *   message="Failed to send"
 *   onDismiss={() => clearError()}
 * />
 */
export function StatusMessage({
  type,
  message,
  onDismiss,
  className = "",
}: StatusMessageProps) {
  const classes = [
    "status",
    `status-${type}`,
    "animate-fade-in",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const icon = getStatusIcon(type);

  return (
    <div className={classes} role="alert">
      <span className="status-icon">{icon}</span>
      <span className="status-message flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="status-dismiss"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
