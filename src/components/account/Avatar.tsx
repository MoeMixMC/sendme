/**
 * Avatar Component
 * ================
 *
 * A deterministic, generated circular profile picture.
 *
 * WHY GENERATED AVATARS?
 * ----------------------
 * 1. Privacy - No external requests with user identifiers
 * 2. Speed - No network latency, instant render
 * 3. Offline - Works without internet
 * 4. Consistency - Same address = same avatar everywhere
 *
 * The algorithm uses address bytes to seed colors,
 * creating a unique gradient for each user.
 */

import React, { useMemo } from "react";
import {
  generateGradient,
  generateInitials,
  getContrastColor,
} from "../../utils/avatar";

type AvatarSize = "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  /** Ethereum address to generate avatar from */
  address: string;
  /** Optional username for initials */
  name?: string;
  /** Size variant */
  size?: AvatarSize;
  /** Show initials overlay */
  showInitials?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get pixel size for each size variant
 */
function getSizePixels(size: AvatarSize): number {
  switch (size) {
    case "sm":
      return 32;
    case "md":
      return 40;
    case "lg":
      return 56;
    case "xl":
      return 80;
    default:
      return 40;
  }
}

/**
 * Avatar - Generated profile picture
 *
 * @example
 * <Avatar address="0x1234..." />
 *
 * @example
 * <Avatar
 *   address="0x1234..."
 *   name="alice"
 *   size="lg"
 *   showInitials
 * />
 */
export function Avatar({
  address,
  name,
  size = "md",
  showInitials = false,
  className = "",
}: AvatarProps) {
  /**
   * useMemo caches the gradient so we don't regenerate
   * on every render. Gradients only change when address changes.
   */
  const gradient = useMemo(
    () => generateGradient(address),
    [address]
  );

  const textColor = useMemo(
    () => getContrastColor(address),
    [address]
  );

  const initials = useMemo(
    () => (name ? generateInitials(name) : ""),
    [name]
  );

  const pixels = getSizePixels(size);

  const classes = ["avatar", `avatar-${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{
        background: gradient,
        width: pixels,
        height: pixels,
        color: textColor,
      }}
      role="img"
      aria-label={name ? `Avatar for ${name}` : "User avatar"}
    >
      {showInitials && name && (
        <span className="avatar-initials">{initials}</span>
      )}
    </div>
  );
}
