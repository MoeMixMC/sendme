/**
 * useUserSearch - User Search with Debouncing
 * ============================================
 *
 * Provides autocomplete search for smart account usernames.
 * Uses debouncing to avoid excessive API calls while typing.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "../trpc";

/** Debounce delay in milliseconds */
const DEBOUNCE_MS = 200;

export interface UserSearchResult {
  address: string;
  name: string;
  lastTxType: "sent" | "received" | null;
  lastTxTime: string | null;
}

interface UseUserSearchReturn {
  /** Search results */
  results: UserSearchResult[];
  /** Whether currently searching */
  isSearching: boolean;
  /** Perform a search */
  search: (query: string) => void;
  /** Clear results */
  clear: () => void;
}

/**
 * useUserSearch - Search for users by username
 *
 * @param searcherAddress - Address of the user performing the search
 */
export function useUserSearch(searcherAddress: string | null): UseUserSearchReturn {
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  // Perform the actual search
  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searcherAddress || searchQuery.length === 0) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);

      try {
        const searchResults = await trpc.searchSmartAccounts.query({
          query: searchQuery,
          searcherAddress,
          limit: 5,
        });

        if (isMounted.current) {
          setResults(
            searchResults.map((r) => ({
              ...r,
              // Keep as string - will be parsed by formatTimestamp
              lastTxTime: r.lastTxTime ? String(r.lastTxTime) : null,
            }))
          );
        }
      } catch (err) {
        console.error("Search error:", err);
        if (isMounted.current) {
          setResults([]);
        }
      } finally {
        if (isMounted.current) {
          setIsSearching(false);
        }
      }
    },
    [searcherAddress]
  );

  // Debounced search trigger
  const search = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);

      // Clear previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Empty query clears results immediately
      if (newQuery.length === 0) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      // Debounce the actual search
      setIsSearching(true);
      debounceRef.current = setTimeout(() => {
        performSearch(newQuery);
      }, DEBOUNCE_MS);
    },
    [performSearch]
  );

  // Clear results
  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsSearching(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    results,
    isSearching,
    search,
    clear,
  };
}
