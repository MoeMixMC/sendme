/**
 * Sidebar Component
 * =================
 *
 * Navigation sidebar for the dashboard with tabs.
 */

import React from "react";
import { useUIContext } from "../../context";
import type { DashboardTab } from "../../types";

interface NavItem {
  id: DashboardTab;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "transactions", label: "Transactions", icon: "📋" },
  { id: "pay", label: "Pay", icon: "💸" },
];

/**
 * Sidebar - Dashboard navigation
 */
export function Sidebar() {
  const { dashboardTab, setDashboardTab } = useUIContext();

  return (
    <nav className="sidebar">
      <ul className="sidebar-nav">
        {navItems.map((item) => (
          <li key={item.id}>
            <button
              className={`sidebar-item ${
                dashboardTab === item.id ? "sidebar-item-active" : ""
              }`}
              onClick={() => setDashboardTab(item.id)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
