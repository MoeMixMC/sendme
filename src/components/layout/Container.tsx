/**
 * Container Component
 * ===================
 *
 * A max-width centered container for page content.
 *
 * LAYOUT PATTERN
 * --------------
 * Container provides consistent page margins and max-width.
 * All screen content should be wrapped in a Container
 * to maintain visual consistency.
 */

import React, { type ReactNode, type HTMLAttributes } from "react";

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Add padding for fixed header */
  withHeader?: boolean;
  /** Container content */
  children: ReactNode;
}

/**
 * Container - Centered content wrapper
 *
 * @example
 * <Container>
 *   <Card>Content here</Card>
 * </Container>
 *
 * @example
 * <Container withHeader>
 *   <DashboardContent />
 * </Container>
 */
export function Container({
  withHeader = false,
  className = "",
  children,
  ...props
}: ContainerProps) {
  const classes = [
    "container",
    withHeader ? "container-with-header" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
