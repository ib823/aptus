/**
 * AptusMark — the canonical Aptus brand mark (SVG pyramid + cutout + dot).
 * Source: docs/design/v1.2/components.jsx (the prototype).
 *
 * Renders white-on-dark when placed on a brand-color surface, dark-on-light
 * otherwise — controlled by the `monochrome` prop and inherited `currentColor`.
 *
 * Spec: docs/APTUS-DESIGN-SPEC.md §5.7 (visual identity).
 */

interface AptusMarkProps {
  /** Pixel size of the mark (defaults to 24px). */
  size?: number;
  /** Use a flat single-color fill instead of the gradient. Pair with white text. */
  monochrome?: boolean;
}

export function AptusMark({ size = 24, monochrome = false }: AptusMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="aptus-grad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <path
        d="M16 4 L28 26 L4 26 Z"
        fill={monochrome ? "currentColor" : "url(#aptus-grad)"}
      />
      <path d="M16 13 L22 24 L10 24 Z" fill="var(--aptus-surface, #fff)" />
      <circle cx="16" cy="20" r="1.5" fill="currentColor" />
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
