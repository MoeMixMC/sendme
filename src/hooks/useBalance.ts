/**
 * useBalance - Balance Fetching with Polling
 * ==========================================
 *
 * POLLING PATTERN
 * ---------------
 * We poll the balance every 15 seconds because:
 * 1. WebSocket subscriptions require additional infrastructure
 * 2. Balance changes are infrequent (user-initiated transactions)
 * 3. 15s is fast enough for good UX, slow enough to not hammer RPC
 *
 * For real-time needs (like a trading app), you'd use WebSockets
 * or server-sent events instead.
 *
 * CLEANUP PATTERN
 * ---------------
 * The useEffect cleanup function (return () => clearInterval())
 * is crucial for preventing:
 * 1. Memory leaks from orphaned intervals
 * 2. State updates on unmounted components
 * 3. Multiple intervals running simultaneously
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { parseEther } from "viem";
import { trpc } from "../trpc";

/** Polling interval in milliseconds */
const POLL_INTERVAL = 15000; // 15 seconds

interface UseBalanceOptions {
  /** Whether to enable polling (default: true) */
  enablePolling?: boolean;
  /** Custom polling interval in ms (default: 15000) */
  pollInterval?: number;
}

interface UseBalanceReturn {
  /** Current balance in wei */
  balance: bigint;
  /** Whether currently fetching */
  isLoading: boolean;
  /** Last error, if any */
  error: string | null;
  /** Manually trigger a refresh */
  refresh: () => Promise<void>;
}

/**
 * useBalance - Fetch and poll account balance
 *
 * @param address - Ethereum address to check balance for
 * @param options - Configuration options
 */
export function useBalance(
  address: string | null,
  options: UseBalanceOptions = {}
): UseBalanceReturn {
  const { enablePolling = true, pollInterval = POLL_INTERVAL } = options;

  const [balance, setBalance] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * useRef to track if component is mounted
   *
   * WHY USEREF?
   * Async operations (like fetch) can complete after
   * the component unmounts. Calling setState on an
   * unmounted component causes warnings. We use a ref
   * to check if we should update state.
   */
  const isMounted = useRef(true);

  /**
   * Fetch balance from the server
   *
   * Wrapped in useCallback so it's stable across renders.
   * This allows it to be safely used in useEffect deps.
   */
  const fetchBalance = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await trpc.getBalance.query({ address });

      // Only update state if still mounted
      if (isMounted.current) {
        setBalance(parseEther(result.balance));
      }
    } catch (err) {
      if (isMounted.current) {
        const message = err instanceof Error ? err.message : "Failed to fetch balance";
        setError(message);
        console.error("Balance fetch error:", err);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [address]);

  /**
   * Effect: Fetch on mount and start polling
   */
  useEffect(() => {
    // Track mounted state
    isMounted.current = true;

    if (!address) {
      setBalance(0n);
      return;
    }

    // Initial fetch
    fetchBalance();

    // Set up polling if enabled
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (enablePolling) {
      intervalId = setInterval(fetchBalance, pollInterval);
    }

    /**
     * Cleanup function
     *
     * This runs when:
     * 1. Component unmounts
     * 2. address changes
     * 3. enablePolling or pollInterval changes
     *
     * It ensures we don't have orphaned intervals or
     * state updates on unmounted components.
     */
    return () => {
      isMounted.current = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [address, enablePolling, pollInterval, fetchBalance]);

  return {
    balance,
    isLoading,
    error,
    refresh: fetchBalance,
  };
}
