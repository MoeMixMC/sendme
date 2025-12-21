/**
 * App - Root Application Component
 * =================================
 *
 * This is the composition root for the Digital Cash platform.
 *
 * COMPOSITION ROOT PATTERN
 * ------------------------
 * The App component's sole responsibility is to:
 * 1. Set up context providers (dependency injection)
 * 2. Render the correct screen based on app state
 *
 * All business logic lives in hooks and context.
 * All UI rendering lives in screen components.
 * This keeps App.tsx minimal and focused.
 *
 * PROVIDER ORDER
 * --------------
 * Providers must be nested in dependency order:
 * - AccountProvider: Core account state (no dependencies)
 * - UIProvider: UI state (depends on account for initial screen)
 *
 * SCREEN ROUTING
 * --------------
 * We use a simple state-based routing instead of react-router because:
 * 1. This is a single-page app with no URL needs
 * 2. State-based routing is simpler to understand
 * 3. No additional dependencies needed
 *
 * For apps that need URL routing, consider react-router or @tanstack/router.
 */

import React, { useEffect } from "react";
import { AccountProvider, UIProvider, useUIContext, useAccountContext } from "./context";
import { WelcomeScreen, CreateAccountScreen, DashboardScreen } from "./screens";

// Import styles
import "./styles/index.css";
import "./styles/animations.css";
import "./styles/components.css";

/**
 * ScreenRouter - Renders the appropriate screen based on UI state
 *
 * This component consumes both AccountContext and UIContext to determine
 * which screen to show. It also handles the initial screen logic based
 * on whether a user is already logged in.
 */
function ScreenRouter() {
  const { currentScreen, goToDashboard } = useUIContext();
  const { account } = useAccountContext();

  /**
   * Auto-navigate to dashboard if already logged in
   *
   * When the app loads and there's an account in localStorage,
   * we skip the welcome screen and go straight to dashboard.
   */
  useEffect(() => {
    if (account && currentScreen === "welcome") {
      goToDashboard();
    }
  }, [account, currentScreen, goToDashboard]);

  // Render the appropriate screen
  switch (currentScreen) {
    case "createAccount":
      return <CreateAccountScreen />;
    case "dashboard":
      return account ? <DashboardScreen /> : <WelcomeScreen />;
    case "welcome":
    default:
      return <WelcomeScreen />;
  }
}

/**
 * App - The application entry point
 *
 * Wraps the entire app in context providers and renders the screen router.
 *
 * @example
 * // In main.tsx:
 * createRoot(document.getElementById('root')!).render(<App />);
 */
export default function App() {
  return (
    <AccountProvider>
      <UIProvider>
        <ScreenRouter />
      </UIProvider>
    </AccountProvider>
  );
}
