/**
 * Avatar Generation Utilities
 * ===========================
 *
 * Generates deterministic avatars from Ethereum addresses.
 *
 * WHY DETERMINISTIC AVATARS?
 * --------------------------
 * 1. Privacy - No external requests with user identifiers
 * 2. Speed - No network latency, instant render
 * 3. Offline - Works without internet connection
 * 4. Consistency - Same address = same avatar everywhere
 *
 * The algorithm uses address bytes to seed colors and patterns.
 * Given the same address, it always generates the same avatar.
 */

/**
 * Color pair for gradient avatars
 */
export interface AvatarColors {
  primary: string;
  secondary: string;
}

/**
 * Generate a color pair from an Ethereum address
 *
 * Uses the first bytes of the address to compute HSL colors.
 * The two colors are offset to create pleasing gradients.
 *
 * @param address - Ethereum address (0x...)
 */
export function generateColorsFromAddress(address: string): AvatarColors {
  // Remove 0x prefix and take first 12 hex chars (6 bytes)
  const hex = address.slice(2, 14).toLowerCase();

  // Parse bytes for color generation
  const byte1 = parseInt(hex.slice(0, 2), 16);
  const byte2 = parseInt(hex.slice(2, 4), 16);
  const byte3 = parseInt(hex.slice(4, 6), 16);
  const byte4 = parseInt(hex.slice(6, 8), 16);
  const byte5 = parseInt(hex.slice(8, 10), 16);
  const byte6 = parseInt(hex.slice(10, 12), 16);

  // Primary hue from first two bytes (0-360)
  const hue1 = ((byte1 << 8) | byte2) % 360;

  // Secondary hue offset by 30-90 degrees for contrast
  const hueOffset = 30 + (byte3 % 60);
  const hue2 = (hue1 + hueOffset) % 360;

  // Saturation from byte4 (50-80% for vibrant but not neon)
  const saturation = 50 + (byte4 % 30);

  // Lightness from byte5/6 (45-65% for good visibility)
  const lightness1 = 45 + (byte5 % 20);
  const lightness2 = 45 + (byte6 % 20);

  return {
    primary: `hsl(${hue1}, ${saturation}%, ${lightness1}%)`,
    secondary: `hsl(${hue2}, ${saturation}%, ${lightness2}%)`,
  };
}

/**
 * Generate a CSS gradient string from an address
 *
 * Creates a diagonal gradient suitable for avatar backgrounds.
 *
 * @param address - Ethereum address
 * @param angle - Gradient angle in degrees (default: 135)
 */
export function generateGradient(address: string, angle: number = 135): string {
  const colors = generateColorsFromAddress(address);
  return `linear-gradient(${angle}deg, ${colors.primary}, ${colors.secondary})`;
}

/**
 * Generate initials from a username
 *
 * Takes first character, uppercase.
 * Could be extended for multi-word usernames.
 *
 * @param name - Username
 */
export function generateInitials(name: string): string {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

/**
 * Generate an SVG data URI for an avatar
 *
 * Creates a simple gradient circle SVG that can be used as an img src.
 * This is an alternative to inline CSS gradients.
 *
 * @param address - Ethereum address
 * @param size - Size in pixels
 */
export function generateAvatarSvg(address: string, size: number = 40): string {
  const colors = generateColorsFromAddress(address);
  const id = address.slice(2, 10); // Unique ID for gradient

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="grad-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${colors.primary}" />
          <stop offset="100%" style="stop-color:${colors.secondary}" />
        </linearGradient>
      </defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#grad-${id})" />
    </svg>
  `.trim();

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Get a contrasting text color for avatar initials
 *
 * Returns white or black based on the primary color luminance.
 *
 * @param address - Ethereum address
 */
export function getContrastColor(address: string): string {
  const colors = generateColorsFromAddress(address);
  // Simple heuristic: if primary color is light, use dark text
  // Parse the HSL lightness value
  const match = colors.primary.match(/(\d+)%\)$/);
  if (match && match[1]) {
    const lightness = parseInt(match[1], 10);
    return lightness > 55 ? "#1a1a2e" : "#ffffff";
  }
  return "#ffffff";
}
