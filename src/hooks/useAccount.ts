/**
 * useAccount - Account Operations Hook
 * =====================================
 *
 * CUSTOM HOOK PATTERN
 * -------------------
 * This hook wraps the AccountContext to provide:
 * 1. Simpler API for common operations
 * 2. Additional derived state (isLoggedIn, shortAddress)
 * 3. Memoized values to prevent unnecessary re-renders
 *
 * Components don't need to know about Context internals.
 * They just call useAccount() and get everything they need.
 *
 * WHY DERIVED STATE?
 * ------------------
 * Instead of computing `account !== null` everywhere,
 * we compute it once here as `isLoggedIn`. This:
 * - Reduces code duplication
 * - Ensures consistent logic everywhere
 * - Makes refactoring easier
 */

import { useMemo } from "react";
import { useAccountContext } from "../context";
import { formatAddress, formatBalance } from "../utils";

/**
 * useAccount - Access account state with derived values
 */
export function useAccount() {
  const context = useAccountContext();

  // ----------------------------------------
  // Derived state - computed from context
  // ----------------------------------------

  /**
   * useMemo caches computed values until dependencies change.
   *
   * WHY USEMEMO?
   * If we computed these on every render, we'd create new
   * string objects each time, potentially causing unnecessary
   * re-renders in child components that compare by reference.
   */
  const derived = useMemo(() => {
    const { account, balance } = context;

    return {
      /** Whether user is logged in */
      isLoggedIn: account !== null,

      /** Truncated address for display (0x1234...5678) */
      shortAddress: account ? formatAddress(account.address) : null,

      /** Formatted balance string (e.g., "0.1234") */
      formattedBalance: formatBalance(balance),

      /** Balance with unit (e.g., "0.1234 ETH") */
      balanceWithUnit: `${formatBalance(balance)} ETH`,

      /** Username with @ prefix */
      displayName: account ? `@${account.name}` : null,

      /** Whether account is deployed on-chain */
      isDeployed: account?.deployed ?? false,
    };
  }, [context.account, context.balance]);

  // ----------------------------------------
  // Return combined state
  // ----------------------------------------
  return {
    // Original context values
    account: context.account,
    balance: context.balance,
    isLoading: context.isLoading,

    // Context actions
    setAccount: context.setAccount,
    setBalance: context.setBalance,
    setLoading: context.setLoading,
    markDeployed: context.markDeployed,
    logout: context.logout,
    refreshBalance: context.refreshBalance,

    // Derived values
    ...derived,
  };
}
