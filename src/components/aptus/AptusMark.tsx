/**
 * AptusMark — the canonical Aptus logo mark.
 *
 * Path data and lockup typography are sourced from `src/lib/brand/assets.ts`,
 * the single source of truth for every brand asset (web, PDF, favicon, OG).
 * Edits to the mark MUST be made by replacing the SVGs under `public/icons/`
 * and updating the constants in `assets.ts` together; a drift test fails the
 * build if they diverge.
 */

import {
  APTUS_LOCKUP_FONT_FAMILY,
  APTUS_LOCKUP_FONT_WEIGHT,
  APTUS_MARK_PATH_D,
} from "@/lib/brand/assets";

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
      <path fillRule="evenodd" d={APTUS_MARK_PATH_D} />
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
          fontFamily: APTUS_LOCKUP_FONT_FAMILY,
          fontWeight: APTUS_LOCKUP_FONT_WEIGHT,
          letterSpacing: "-0.025em",
          color: "var(--aptus-text)",
        }}
      >
        Aptus
      </span>
    </div>
  );
}
