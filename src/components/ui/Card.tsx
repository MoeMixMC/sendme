/**
 * Card Component
 * ==============
 *
 * A glassmorphism-styled container for grouping content.
 *
 * COMPOSITION PATTERN
 * -------------------
 * Card is a simple container that wraps children.
 * It can optionally include:
 * - Title (via title prop)
 * - Subtitle (via subtitle prop)
 * - Custom content (via children)
 *
 * For more complex cards, use Card as a container
 * and compose your own layout inside.
 */

import React, { type ReactNode, type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card title */
  title?: string;
  /** Card subtitle (shown below title) */
  subtitle?: string;
  /** Enable hover effect */
  hoverable?: boolean;
  /** Card content */
  children: ReactNode;
  /** Animation class */
  animate?: "fade-in" | "scale-in" | "fade-in-up" | "fade-in-scale" | "celebrate" | "none";
}

/**
 * Card - Container with glassmorphism effect
 *
 * @example
 * <Card title="Balance" subtitle="Base Sepolia">
 *   <span className="text-3xl font-bold">0.1234 ETH</span>
 * </Card>
 *
 * @example
 * <Card hoverable animate="fade-in-up">
 *   <CustomContent />
 * </Card>
 */
export function Card({
  title,
  subtitle,
  hoverable = false,
  animate = "none",
  className = "",
  children,
  ...props
}: CardProps) {
  const animationClass =
    animate !== "none" ? `animate-${animate}` : "";

  const classes = [
    "card",
    hoverable ? "card-hover" : "",
    animationClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {title && <h2 className="card-title">{title}</h2>}
      {subtitle && <p className="card-subtitle">{subtitle}</p>}
      {children}
    </div>
  );
}
