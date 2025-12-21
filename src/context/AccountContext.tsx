/**
 * AccountContext - Global Account State Management
 * =================================================
 *
 * WHY REACT CONTEXT?
 * ------------------
 * The account state needs to be accessed by many nested components:
 * - Header needs the balance and username for display
 * - DashboardScreen needs the full account object
 * - SendForm needs the address for transaction signing
 * - TransactionList needs the address for history lookup
 *
 * Without Context, we'd need to "prop drill" - pass the account
 * through every intermediate component. Context provides
 * "teleportation" of state to any component that needs it.
 *
 * WHY CONTEXT OVER REDUX/ZUSTAND?
 * -------------------------------
 * This app has simple, predictable state transitions:
 * - null -> SmartAccount (login/create)
 * - SmartAccount -> null (logout)
 * - SmartAccount -> SmartAccount (balance update, deployed status)
 *
 * Redux's boilerplate (actions, reducers, selectors, middleware)
 * would be overkill for this use case. Context + useReducer gives
 * us predictable state updates with less code.
 *
 * PATTERN: Provider + Hook
 * ------------------------
 * We export:
 * 1. AccountProvider - Wraps the app to provide state
 * 2. useAccountContext - Hook for consuming state
 *
 * Components never import the Context directly; they use the hook.
 * This allows us to add validation and throw helpful errors.
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { SmartAccount } from "../types";
import { trpc } from "../trpc";
import { parseEther } from "viem";

// ============================================
// State & Action Types
// ============================================

interface AccountState {
  /** Current logged-in account, or null if not logged in */
  account: SmartAccount | null;
  /** ETH balance in wei */
  balance: bigint;
  /** Loading state for async operations */
  isLoading: boolean;
}

/**
 * Action types for the reducer
 *
 * Using discriminated unions ensures TypeScript knows exactly
 * what payload each action has. This prevents bugs like
 * dispatching SET_ACCOUNT with a balance payload.
 */
type AccountAction =
  | { type: "SET_ACCOUNT"; payload: SmartAccount | null }
  | { type: "SET_BALANCE"; payload: bigint }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "MARK_DEPLOYED" }
  | { type: "LOGOUT" };

// ============================================
// Context Value Type
// ============================================

interface AccountContextValue extends AccountState {
  // Actions - these are stable callbacks that components can use
  setAccount: (account: SmartAccount | null) => void;
  setBalance: (balance: bigint) => void;
  setLoading: (loading: boolean) => void;
  markDeployed: () => void;
  logout: () => void;
  refreshBalance: () => Promise<void>;
}

// ============================================
// Initial State
// ============================================

const initialState: AccountState = {
  account: null,
  balance: 0n,
  isLoading: false,
};

// ============================================
// Reducer
// ============================================

/**
 * Account reducer - handles all state transitions
 *
 * WHY A REDUCER?
 * --------------
 * While useState could work, useReducer is better when:
 * 1. State has multiple related values (account, balance, loading)
 * 2. The next state depends on the previous state
 * 3. You want predictable, traceable state changes
 *
 * Each case handles one type of state change, making it easy
 * to understand and debug what's happening in your app.
 */
function accountReducer(
  state: AccountState,
  action: AccountAction
): AccountState {
  switch (action.type) {
    case "SET_ACCOUNT":
      return {
        ...state,
        account: action.payload,
        // Reset balance when account changes
        balance: action.payload ? state.balance : 0n,
      };

    case "SET_BALANCE":
      return {
        ...state,
        balance: action.payload,
      };

    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.payload,
      };

    case "MARK_DEPLOYED":
      if (!state.account) return state;
      return {
        ...state,
        account: {
          ...state.account,
          deployed: true,
        },
      };

    case "LOGOUT":
      return {
        ...initialState,
      };

    default:
      return state;
  }
}

// ============================================
// Context Creation
// ============================================

const AccountContext = createContext<AccountContextValue | null>(null);

// ============================================
// Provider Component
// ============================================

const STORAGE_KEY = "daimo-simple-account";

interface AccountProviderProps {
  children: ReactNode;
}

export function AccountProvider({ children }: AccountProviderProps) {
  const [state, dispatch] = useReducer(accountReducer, initialState);

  // ----------------------------------------
  // Load account from localStorage on mount
  // ----------------------------------------
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const account = JSON.parse(stored) as SmartAccount;
        dispatch({ type: "SET_ACCOUNT", payload: account });
      } catch {
        // Invalid JSON, clear it
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // ----------------------------------------
  // Persist account to localStorage on change
  // ----------------------------------------
  useEffect(() => {
    if (state.account) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.account));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state.account]);

  // ----------------------------------------
  // Stable action callbacks
  // ----------------------------------------

  /**
   * useCallback memoizes these functions so they don't change
   * on every render. This is important because:
   * 1. Components can safely use them in useEffect dependencies
   * 2. Child components won't re-render unnecessarily
   */
  const setAccount = useCallback((account: SmartAccount | null) => {
    dispatch({ type: "SET_ACCOUNT", payload: account });
  }, []);

  const setBalance = useCallback((balance: bigint) => {
    dispatch({ type: "SET_BALANCE", payload: balance });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: "SET_LOADING", payload: loading });
  }, []);

  const markDeployed = useCallback(() => {
    dispatch({ type: "MARK_DEPLOYED" });
  }, []);

  const logout = useCallback(() => {
    dispatch({ type: "LOGOUT" });
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!state.account) return;

    try {
      const result = await trpc.getBalance.query({
        address: state.account.address,
      });
      dispatch({ type: "SET_BALANCE", payload: parseEther(result.balance) });
    } catch (error) {
      console.error("Failed to refresh balance:", error);
    }
  }, [state.account]);

  // ----------------------------------------
  // Context value
  // ----------------------------------------
  const value: AccountContextValue = {
    ...state,
    setAccount,
    setBalance,
    setLoading,
    markDeployed,
    logout,
    refreshBalance,
  };

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

// ============================================
// Consumer Hook
// ============================================

/**
 * useAccountContext - Access account state and actions
 *
 * WHY A CUSTOM HOOK?
 * ------------------
 * 1. Throws a helpful error if used outside Provider
 * 2. Provides better TypeScript inference
 * 3. Allows us to add derived state or validation later
 */
export function useAccountContext(): AccountContextValue {
  const context = useContext(AccountContext);

  if (!context) {
    throw new Error(
      "useAccountContext must be used within an AccountProvider. " +
        "Wrap your app in <AccountProvider>."
    );
  }

  return context;
}
