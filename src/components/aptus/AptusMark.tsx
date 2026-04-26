/**
 * AptusMark — the canonical Aptus logo mark.
 *
 * Uses the SAME path as `public/icons/aptus-mark.svg` (the asset already
 * shipped by the live app via `<ABeamLogo>`). Single path, even-odd fill
 * rule — the inner triangle is a cutout that shows the surface color
 * through (no need for a separate "inner" path).
 *
 * Color inheritance: fill is `currentColor` so the mark adopts the
 * surrounding text color. Use white text on a brand-colored band for
 * white-on-dark; default text color (#0B0B0F) on light surfaces.
 */

interface AptusMarkProps {
  /** Pixel size of the mark (defaults to 24 px). */
  size?: number;
}

export function AptusMark({ size = 24 }: AptusMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M 47.5 10 Q 50 7 52.5 10 L 88 82 Q 90.5 87 85 87 L 15 87 Q 9.5 87 12 82 Z M 50 40 L 33 76 L 67 76 Z"
      />
    </svg>
  );
}

interface AptusWordmarkProps {
  /** Font size of the "Aptus" text. The mark scales to size + 6. */
  size?: number;
}

export function AptusWordmark({ size = 18 }: AptusWordmarkProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <AptusMark size={size + 6} />
      <span
        style={{
          fontSize: size,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: "var(--aptus-text)",
        }}
      >
        Aptus
      </span>
    </div>
  );
}
