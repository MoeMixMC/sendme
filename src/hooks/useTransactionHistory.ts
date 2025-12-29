/**
 * useTransactionHistory - Transaction History Hook
 * =================================================
 *
 * Fetches and polls transaction history for an account.
 * Similar pattern to useBalance but for transaction data.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "../trpc";
import type { Transaction } from "../types";

/** Polling interval in milliseconds */
const POLL_INTERVAL = 15000; // 15 seconds

/** Default number of transactions to fetch */
const DEFAULT_LIMIT = 10;

interface UseTransactionHistoryOptions {
  /** Number of transactions to fetch */
  limit?: number;
  /** Whether to enable polling */
  enablePolling?: boolean;
  /** Custom polling interval in ms */
  pollInterval?: number;
}

interface UseTransactionHistoryReturn {
  /** List of transactions */
  transactions: Transaction[];
  /** Whether currently fetching */
  isLoading: boolean;
  /** Last error, if any */
  error: string | null;
  /** Manually trigger a refresh */
  refresh: () => Promise<void>;
}

/**
 * Map raw API response to Transaction type
 *
 * The API returns snake_case, we use camelCase internally.
 * This mapping keeps our types clean and API-agnostic.
 */
function mapTransaction(raw: any): Transaction {
  return {
    id: raw.id,
    userOpHash: raw.user_op_hash,
    sender: raw.sender,
    senderName: raw.sender_name || null,
    toAddress: raw.to_address,
    toName: raw.to_name || null,
    value: raw.value,
    status: raw.status,
    txHash: raw.tx_hash,
    createdAt: new Date(raw.created_at),
  };
}

/**
 * useTransactionHistory - Fetch transaction history with polling
 *
 * @param address - Account address to fetch history for
 * @param options - Configuration options
 */
export function useTransactionHistory(
  address: string | null,
  options: UseTransactionHistoryOptions = {}
): UseTransactionHistoryReturn {
  const {
    limit = DEFAULT_LIMIT,
    enablePolling = true,
    pollInterval = POLL_INTERVAL,
  } = options;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);

  const fetchHistory = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await trpc.getUserOpHistory.query({ address, limit });

      if (isMounted.current) {
        // Map and sort by date (newest first)
        const mapped = result.map(mapTransaction);
        setTransactions(mapped);
      }
    } catch (err) {
      if (isMounted.current) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch history";
        setError(message);
        console.error("History fetch error:", err);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [address, limit]);

  useEffect(() => {
    isMounted.current = true;

    if (!address) {
      setTransactions([]);
      return;
    }

    // Initial fetch
    fetchHistory();

    // Set up polling
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (enablePolling) {
      intervalId = setInterval(fetchHistory, pollInterval);
    }

    return () => {
      isMounted.current = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [address, enablePolling, pollInterval, fetchHistory]);

  return {
    transactions,
    isLoading,
    error,
    refresh: fetchHistory,
  };
}
