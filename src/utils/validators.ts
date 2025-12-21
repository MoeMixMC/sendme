/**
 * Validation Utilities
 * ====================
 *
 * Pure functions for validating user input.
 *
 * WHY SEPARATE VALIDATORS?
 * ------------------------
 * 1. Consistent validation rules across forms
 * 2. Easy to test validation logic
 * 3. Reusable in frontend and could be shared with backend
 * 4. Clear error messages in one place
 */

import type { ValidationState } from "../types";

/**
 * Validate an Ethereum address
 *
 * Checks format only, not if address is deployed or valid checksum.
 * For a wallet app, format validation is usually sufficient.
 *
 * @param address - The address to validate
 */
export function validateAddress(address: string): ValidationState {
  if (!address) {
    return { isValid: false, error: "Address is required" };
  }

  if (!address.startsWith("0x")) {
    return { isValid: false, error: "Address must start with 0x" };
  }

  if (address.length !== 42) {
    return { isValid: false, error: "Address must be 42 characters" };
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { isValid: false, error: "Invalid address format" };
  }

  return { isValid: true, error: null };
}

/**
 * Validate a send amount
 *
 * Checks that amount is a valid positive number.
 * Optionally checks against available balance.
 *
 * @param amount - The amount string to validate
 * @param maxBalance - Optional max balance to check against
 */
export function validateAmount(
  amount: string,
  maxBalance?: bigint
): ValidationState {
  if (!amount) {
    return { isValid: false, error: "Amount is required" };
  }

  const num = parseFloat(amount);

  if (isNaN(num)) {
    return { isValid: false, error: "Invalid amount" };
  }

  if (num <= 0) {
    return { isValid: false, error: "Amount must be greater than 0" };
  }

  // Check if exceeds balance (if provided)
  if (maxBalance !== undefined) {
    const amountWei = BigInt(Math.floor(num * 1e18));
    if (amountWei > maxBalance) {
      return { isValid: false, error: "Insufficient balance" };
    }
  }

  return { isValid: true, error: null };
}

/**
 * Validate a username
 *
 * Usernames must be:
 * - 3-20 characters
 * - Lowercase alphanumeric only
 *
 * @param username - The username to validate
 */
export function validateUsername(username: string): ValidationState {
  if (!username) {
    return { isValid: false, error: "Username is required" };
  }

  if (username.length < 3) {
    return { isValid: false, error: "Username must be at least 3 characters" };
  }

  if (username.length > 20) {
    return { isValid: false, error: "Username must be 20 characters or less" };
  }

  if (!/^[a-z0-9]+$/.test(username)) {
    return { isValid: false, error: "Only lowercase letters and numbers" };
  }

  return { isValid: true, error: null };
}

/**
 * Sanitize username input
 *
 * Removes invalid characters and lowercases.
 * Use this on input change, validate on submit.
 *
 * @param input - Raw input string
 */
export function sanitizeUsername(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Sanitize amount input
 *
 * Allows only numbers and a single decimal point.
 *
 * @param input - Raw input string
 */
export function sanitizeAmount(input: string): string {
  // Remove everything except digits and dots
  let sanitized = input.replace(/[^0-9.]/g, "");

  // Ensure only one decimal point
  const parts = sanitized.split(".");
  if (parts.length > 2) {
    sanitized = parts[0] + "." + parts.slice(1).join("");
  }

  return sanitized;
}

/**
 * Check if address is zero address
 *
 * The zero address is a special address that shouldn't receive funds.
 *
 * @param address - The address to check
 */
export function isZeroAddress(address: string): boolean {
  return address === "0x0000000000000000000000000000000000000000";
}
