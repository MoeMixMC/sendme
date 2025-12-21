/**
 * Application Entry Point
 * =======================
 *
 * This file bootstraps the React application.
 * Styles are imported in App.tsx to keep this file minimal.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
