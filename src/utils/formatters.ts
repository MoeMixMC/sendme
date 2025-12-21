/**
 * Formatter Utilities
 * ===================
 *
 * Pure functions for formatting data for display.
 *
 * WHY SEPARATE FORMATTERS?
 * ------------------------
 * 1. Reusable across components
 * 2. Easy to test in isolation
 * 3. Consistent formatting app-wide
 * 4. Changes in one place affect everywhere
 */

import { formatEther as viemFormatEther } from "viem";

/**
 * Format an Ethereum address for display
 *
 * Truncates the middle to show: 0x1234...5678
 * This is a common UX pattern in crypto apps.
 *
 * @param address - Full Ethereum address (0x...)
 * @param prefixLen - Characters to show after 0x (default: 4)
 * @param suffixLen - Characters to show at end (default: 4)
 */
export function formatAddress(
  address: string,
  prefixLen: number = 4,
  suffixLen: number = 4
): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 2 + prefixLen)}...${address.slice(-suffixLen)}`;
}

/**
 * Format ETH balance for display
 *
 * Converts from wei (bigint) to ETH with appropriate decimal places.
 * Handles edge cases like zero balance and very small amounts.
 *
 * @param balance - Balance in wei as bigint
 * @param decimals - Decimal places to show (default: 4)
 */
export function formatBalance(balance: bigint, decimals: number = 4): string {
  const eth = viemFormatEther(balance);
  const num = parseFloat(eth);

  // Show "0" for zero balance
  if (num === 0) return "0";

  // For very small amounts, show more decimals
  if (num > 0 && num < 0.0001) {
    return "< 0.0001";
  }

  // Format with specified decimals, removing trailing zeros
  return num.toFixed(decimals).replace(/\.?0+$/, "");
}

/**
 * Format ETH balance with unit suffix
 *
 * @param balance - Balance in wei as bigint
 */
export function formatBalanceWithUnit(balance: bigint): string {
  return `${formatBalance(balance)} ETH`;
}

/**
 * Format a transaction hash for display
 *
 * @param hash - Full transaction hash
 */
export function formatTxHash(hash: string): string {
  return formatAddress(hash, 6, 4);
}

/**
 * Format a timestamp for display
 *
 * Shows relative time for recent, absolute for older.
 *
 * @param date - Date object or timestamp
 */
export function formatTimestamp(date: Date | string | number): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString();
}

/**
 * Format a username with @ prefix
 *
 * @param name - Username without @
 */
export function formatUsername(name: string): string {
  return `@${name}`;
}

/**
 * Truncate text with ellipsis
 *
 * @param text - Text to truncate
 * @param maxLen - Maximum length
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}
