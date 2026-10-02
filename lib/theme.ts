/**
 * Theme palette as plain hex, for places that can't read CSS variables (OG/share images, meta tags).
 * Mirrors the @theme colour tokens in app/globals.css; keep the two in sync. See THEME.md.
 * Type scale, radii and component utilities (card, tile, field, chip, seg, tab, link, skeleton, btn-*)
 * are CSS-only and live in globals.css.
 */
export const THEME = {
  bg: "#0e0d12",
  surface: "#16151c",
  surfaceRaised: "#1f1e27",
  border: "#2c2b36",
  borderStrong: "#3d3c4a",
  fg: "#f5f4f8",
  fgSecondary: "#c9c7d3",
  mute: "#9b99ab",
  accent: "#ff5c1a",
  accentHover: "#ff7a3d",
  accentFg: "#170b05",
  up: "#22c98a",
  dn: "#f2546b",
  gold: "#e8b84a",
  silver: "#b9c2cf",
  bronze: "#cf8a57",
} as const;
