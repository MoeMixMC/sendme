/**
 * useLocalStorage - Type-safe localStorage Hook
 * =============================================
 *
 * WHY A CUSTOM HOOK FOR LOCALSTORAGE?
 * -----------------------------------
 * localStorage has several quirks:
 * 1. It only stores strings (need JSON serialize/deserialize)
 * 2. It can throw errors (storage quota, private browsing)
 * 3. It's synchronous (can block rendering)
 * 4. Changes in other tabs don't trigger re-renders
 *
 * This hook wraps localStorage with:
 * - Type safety via generics
 * - Automatic JSON serialization
 * - Error handling
 * - SSR safety (checks for window)
 *
 * USAGE:
 * const [value, setValue] = useLocalStorage('key', defaultValue);
 */

import { useState, useCallback, useEffect } from "react";

/**
 * Read a value from localStorage
 *
 * @param key - Storage key
 * @param defaultValue - Value to return if key doesn't exist
 */
function getStoredValue<T>(key: string, defaultValue: T): T {
  // SSR safety check
  if (typeof window === "undefined") {
    return defaultValue;
  }

  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }
    return JSON.parse(item) as T;
  } catch (error) {
    console.warn(`Error reading localStorage key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * useLocalStorage Hook
 *
 * Works like useState, but persists to localStorage.
 *
 * @param key - The localStorage key
 * @param defaultValue - Initial value if key doesn't exist
 * @returns Tuple of [value, setValue, removeValue]
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // Initialize state from localStorage
  const [storedValue, setStoredValue] = useState<T>(() =>
    getStoredValue(key, defaultValue)
  );

  /**
   * Update value in state and localStorage
   *
   * Accepts a value or updater function (like useState).
   */
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        // Handle updater function pattern
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;

        // Update React state
        setStoredValue(valueToStore);

        // Update localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  /**
   * Remove value from localStorage
   */
  const removeValue = useCallback(() => {
    try {
      setStoredValue(defaultValue);
      if (typeof window !== "undefined") {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, defaultValue]);

  /**
   * Sync with localStorage changes from other tabs
   *
   * The 'storage' event fires when localStorage changes in another tab.
   * This keeps our state in sync across browser tabs.
   */
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key && event.newValue !== null) {
        try {
          setStoredValue(JSON.parse(event.newValue));
        } catch {
          // Invalid JSON, ignore
        }
      } else if (event.key === key && event.newValue === null) {
        setStoredValue(defaultValue);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [key, defaultValue]);

  return [storedValue, setValue, removeValue];
}
