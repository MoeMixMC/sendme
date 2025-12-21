/**
 * UIContext - UI State Management
 * ================================
 *
 * SEPARATION OF CONCERNS
 * ----------------------
 * UI state (current screen, status messages, global loading) is
 * conceptually different from business state (account, balance).
 *
 * Keeping them separate means:
 * 1. UI components can subscribe only to UI state (fewer re-renders)
 * 2. Business logic doesn't get polluted with UI concerns
 * 3. Easier to test each layer independently
 * 4. Clear mental model of what's "UI" vs "data"
 *
 * WHAT'S IN UI STATE?
 * -------------------
 * - currentScreen: Which screen/view is showing
 * - status: Current status message (success/error/info)
 * - isGlobalLoading: App-wide loading overlay
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Screen, Status, StatusType } from "../types";

// ============================================
// State & Action Types
// ============================================

interface UIState {
  /** Current screen being displayed */
  currentScreen: Screen;
  /** Status message (auto-dismisses after timeout) */
  status: Status | null;
  /** Global loading overlay */
  isGlobalLoading: boolean;
}

type UIAction =
  | { type: "SET_SCREEN"; payload: Screen }
  | { type: "SET_STATUS"; payload: Status | null }
  | { type: "SET_GLOBAL_LOADING"; payload: boolean };

// ============================================
// Context Value Type
// ============================================

interface UIContextValue extends UIState {
  // Navigation
  setScreen: (screen: Screen) => void;
  goToWelcome: () => void;
  goToCreateAccount: () => void;
  goToDashboard: () => void;

  // Status messages
  showStatus: (type: StatusType, message: string) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  clearStatus: () => void;

  // Loading
  setGlobalLoading: (loading: boolean) => void;
}

// ============================================
// Initial State
// ============================================

const initialState: UIState = {
  currentScreen: "welcome",
  status: null,
  isGlobalLoading: false,
};

// ============================================
// Reducer
// ============================================

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_SCREEN":
      return {
        ...state,
        currentScreen: action.payload,
        // Clear status when changing screens (fresh start)
        status: null,
      };

    case "SET_STATUS":
      return {
        ...state,
        status: action.payload,
      };

    case "SET_GLOBAL_LOADING":
      return {
        ...state,
        isGlobalLoading: action.payload,
      };

    default:
      return state;
  }
}

// ============================================
// Context Creation
// ============================================

const UIContext = createContext<UIContextValue | null>(null);

// ============================================
// Provider Component
// ============================================

/** How long status messages stay visible (ms) */
const STATUS_TIMEOUT = 5000;

interface UIProviderProps {
  children: ReactNode;
}

export function UIProvider({ children }: UIProviderProps) {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  // ----------------------------------------
  // Auto-dismiss status messages
  // ----------------------------------------
  useEffect(() => {
    if (!state.status) return;

    // Success and info messages auto-dismiss
    // Errors stay until manually cleared (user might need to read them)
    if (state.status.type !== "error") {
      const timer = setTimeout(() => {
        dispatch({ type: "SET_STATUS", payload: null });
      }, STATUS_TIMEOUT);

      // Cleanup: clear timer if status changes or component unmounts
      return () => clearTimeout(timer);
    }
  }, [state.status]);

  // ----------------------------------------
  // Action callbacks
  // ----------------------------------------

  const setScreen = useCallback((screen: Screen) => {
    dispatch({ type: "SET_SCREEN", payload: screen });
  }, []);

  const goToWelcome = useCallback(() => {
    dispatch({ type: "SET_SCREEN", payload: "welcome" });
  }, []);

  const goToCreateAccount = useCallback(() => {
    dispatch({ type: "SET_SCREEN", payload: "createAccount" });
  }, []);

  const goToDashboard = useCallback(() => {
    dispatch({ type: "SET_SCREEN", payload: "dashboard" });
  }, []);

  const showStatus = useCallback((type: StatusType, message: string) => {
    dispatch({ type: "SET_STATUS", payload: { type, message } });
  }, []);

  const showSuccess = useCallback((message: string) => {
    dispatch({ type: "SET_STATUS", payload: { type: "success", message } });
  }, []);

  const showError = useCallback((message: string) => {
    dispatch({ type: "SET_STATUS", payload: { type: "error", message } });
  }, []);

  const showInfo = useCallback((message: string) => {
    dispatch({ type: "SET_STATUS", payload: { type: "info", message } });
  }, []);

  const clearStatus = useCallback(() => {
    dispatch({ type: "SET_STATUS", payload: null });
  }, []);

  const setGlobalLoading = useCallback((loading: boolean) => {
    dispatch({ type: "SET_GLOBAL_LOADING", payload: loading });
  }, []);

  // ----------------------------------------
  // Context value
  // ----------------------------------------
  const value: UIContextValue = {
    ...state,
    setScreen,
    goToWelcome,
    goToCreateAccount,
    goToDashboard,
    showStatus,
    showSuccess,
    showError,
    showInfo,
    clearStatus,
    setGlobalLoading,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

// ============================================
// Consumer Hook
// ============================================

export function useUIContext(): UIContextValue {
  const context = useContext(UIContext);

  if (!context) {
    throw new Error(
      "useUIContext must be used within a UIProvider. " +
        "Wrap your app in <UIProvider>."
    );
  }

  return context;
}
