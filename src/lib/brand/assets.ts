/**
 * Single source of truth for the Aptus brand mark, wordmark, and favicon.
 *
 * Canonical files (do not edit — regenerate from `Logo (1).zip`):
 *   public/icons/aptus-mark.svg       — symbol only
 *   public/icons/aptus-lockup.svg     — wordmark (mark + "Aptus" text)
 *   public/icons/aptus-favicon.svg    — 16×16 simplified mark for favicon
 *
 * Every consumer (web component, PDF generator, OG image, manifest icon)
 * MUST resolve the mark through this module. The `APTUS_MARK_PATH_D` and
 * `APTUS_LOCKUP_*` constants below are byte-mirrored from the canonical
 * SVGs and asserted by `tests/unit/brand-assets.test.ts`.
 */

export const APTUS_BRAND_COLOR = "#0B0B0F";
export const APTUS_BRAND_TEXT = "#FFFFFF";

/** Path-data of `aptus-mark.svg`. ViewBox `0 0 100 100`, even-odd fill. */
export const APTUS_MARK_PATH_D =
  "M 47.5 10 Q 50 7 52.5 10 L 88 82 Q 90.5 87 85 87 L 15 87 Q 9.5 87 12 82 Z M 50 40 L 33 76 L 67 76 Z";

/** Path-data of `aptus-favicon.svg`. ViewBox `0 0 16 16`, simplified for crisp 16×16. */
export const APTUS_FAVICON_PATH_D =
  "M 8 1 L 14 14 L 2 14 Z M 8 7 L 5 12 L 11 12 Z";

/** Lockup wordmark layout — these constants drive the React/PDF lockup so it
 * matches `aptus-lockup.svg` exactly. ViewBox `0 0 360 100`. */
export const APTUS_LOCKUP_VIEWBOX = "0 0 360 100";
export const APTUS_LOCKUP_TEXT_X = 118;
export const APTUS_LOCKUP_TEXT_Y = 72;
export const APTUS_LOCKUP_FONT_SIZE = 72;
export const APTUS_LOCKUP_LETTER_SPACING = -1.8;
export const APTUS_LOCKUP_FONT_FAMILY =
  "Geist, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif";
export const APTUS_LOCKUP_FONT_WEIGHT = 500;

/** Public URLs (Next.js serves /public at site root). */
export const APTUS_MARK_SVG_URL = "/icons/aptus-mark.svg";
export const APTUS_LOCKUP_SVG_URL = "/icons/aptus-lockup.svg";
export const APTUS_FAVICON_SVG_URL = "/icons/aptus-favicon.svg";
export const APTUS_ICON_192_URL = "/icons/icon-192x192.png";
export const APTUS_ICON_512_URL = "/icons/icon-512x512.png";
