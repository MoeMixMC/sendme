/**
 * RecipientInput Component
 * ========================
 *
 * Input for selecting a recipient by username or address.
 * Features autocomplete dropdown with user search.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "../ui";
import { Avatar } from "../account/Avatar";
import { useUserSearch, useAccount } from "../../hooks";
import { validateAddress, formatTimestamp } from "../../utils";
import type { UserSearchResult } from "../../hooks/useUserSearch";

interface RecipientInputProps {
  /** Current value (address or username) */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Called when a user is selected from dropdown */
  onSelectUser?: (user: UserSearchResult) => void;
  /** Disable input */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format the last transaction context
 */
function formatLastTx(type: "sent" | "received" | null, time: string | null): string | null {
  if (!type || !time) return null;
  const timeAgo = formatTimestamp(new Date(time));
  return type === "sent" ? `Sent ${timeAgo}` : `Received ${timeAgo}`;
}

/**
 * RecipientInput - Username/address input with autocomplete
 */
export function RecipientInput({
  value,
  onChange,
  onSelectUser,
  disabled = false,
  placeholder = "Username or 0x address",
  label,
  className = "",
}: RecipientInputProps) {
  const { account } = useAccount();
  const { results, isSearching, search, clear } = useUserSearch(account?.address ?? null);

  const [isFocused, setIsFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine if current value looks like an address
  const isAddressInput = value.startsWith("0x");
  const validation = isAddressInput ? validateAddress(value) : { isValid: true, error: null };
  const showError = touched && isAddressInput && !validation.isValid && value.length > 2;

  // Show dropdown when focused, has results, and input looks like username
  const showDropdown = isFocused && results.length > 0 && !isAddressInput;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      // Search if it looks like a username (not starting with 0x)
      if (!newValue.startsWith("0x") && newValue.length > 0) {
        search(newValue);
      } else {
        clear();
      }
    },
    [onChange, search, clear]
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setTouched(true);
    // Delay hiding dropdown to allow click on items
    setTimeout(() => {
      setIsFocused(false);
    }, 150);
  }, []);

  const handleSelectUser = useCallback(
    (user: UserSearchResult) => {
      onChange(user.address);
      clear();
      setIsFocused(false);
      onSelectUser?.(user);
    },
    [onChange, clear, onSelectUser]
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`recipient-input-wrapper ${className}`}>
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        label={label}
        disabled={disabled}
        error={showError ? validation.error : null}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {/* Autocomplete Dropdown */}
      {showDropdown && (
        <div ref={dropdownRef} className="recipient-dropdown">
          {results.map((user) => (
            <button
              key={user.address}
              type="button"
              className="recipient-dropdown-item"
              onClick={() => handleSelectUser(user)}
            >
              <Avatar address={user.address} name={user.name} size="sm" />
              <div className="recipient-dropdown-info">
                <span className="recipient-dropdown-name">@{user.name}</span>
                {user.lastTxType && user.lastTxTime && (
                  <span className="recipient-dropdown-context">
                    {formatLastTx(user.lastTxType, user.lastTxTime)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
