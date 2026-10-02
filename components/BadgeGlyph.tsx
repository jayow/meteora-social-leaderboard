import type { BadgeId } from "@/lib/badges/config";

/*
 * Badge glyphs, kept free of client code so server renderers (share cards) can draw them too.
 * `color` overrides currentColor where there is no CSS (the share card image).
 */
/** 16x16 line glyphs, drawn with currentColor. */
export function BadgeGlyph({ id, size = 12, className = "", color }: { id: BadgeId; size?: number; className?: string; color?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: color ?? "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (id) {
    case "first_splash":
      return (
        <svg {...common}>
          <path d="M8 2.2c2.3 2.8 4.1 5 4.1 7.3a4.1 4.1 0 0 1-8.2 0c0-2.3 1.8-4.5 4.1-7.3z" />
        </svg>
      );
    case "fee_farmer":
      return (
        <svg {...common}>
          <path d="M8 14V7.2" />
          <path d="M8 9.6C8 7.3 6.2 5.8 3.6 5.8c0 2.3 1.8 3.8 4.4 3.8z" />
          <path d="M8 7.2c0-2.4 1.9-4 4.5-4 0 2.4-1.9 4-4.5 4z" />
        </svg>
      );
    case "whale_volume":
      return (
        <svg {...common}>
          <path d="M1.8 6.2q1.55-1.6 3.1 0t3.1 0 3.1 0 3.1 0" />
          <path d="M1.8 10.6q1.55-1.6 3.1 0t3.1 0 3.1 0 3.1 0" />
        </svg>
      );
    case "sharpshooter":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.6" />
          <circle cx="8" cy="8" r="2.6" />
          <circle cx="8" cy="8" r="0.6" fill={color ?? "currentColor"} />
        </svg>
      );
    case "in_the_green":
      return (
        <svg {...common}>
          <path d="M2 11.8l4-4 2.6 2.6L14 5" />
          <path d="M10.2 5H14v3.8" />
        </svg>
      );
    case "pool_hopper":
      return (
        <svg {...common}>
          <ellipse cx="3.8" cy="12" rx="2" ry="1.1" />
          <ellipse cx="12.2" cy="12" rx="2" ry="1.1" />
          <path d="M3.8 9.4C5 4.6 11 4.6 12.2 9.4" strokeDasharray="1.6 1.9" />
        </svg>
      );
    case "podium":
      return (
        <svg {...common}>
          <path d="M1.8 13.6h12.4" />
          <path d="M5.6 13.6V5.8h4.8v7.8" />
          <path d="M1.8 13.6V9.2h3.8" />
          <path d="M10.4 13.6V7.6h3.8v6" />
        </svg>
      );
  }
}
