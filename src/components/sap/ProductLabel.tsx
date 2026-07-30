/**
 * An SAP product, shown the same way everywhere.
 *
 * WHY THIS IS ONE COMPONENT AND NOT SIX COPIES. Six surfaces rendered the
 * product: the Studio connections table and its picker, the tenant switcher,
 * two Ops tables and two Control Tower lines. Fixing one of them left five
 * showing `s4hana`, which is the same shape as the two-registry defect and the
 * five routes that knew only one of them. A thing rendered in six places from
 * six inline expressions is a thing that drifts.
 *
 * NO `"use client"` HERE, DELIBERATELY. This has no state and no handlers, so
 * it renders in a server component and a client one alike. Marking it would
 * force every server caller to pull in a client boundary for a span and an
 * image, and — as this codebase has twice paid for — a client module cannot
 * hand a value to a server one.
 *
 * The glyph is decorative: `alt=""`. The name beside it is the accessible text,
 * so a screen reader hears the product once rather than twice, and the row
 * still reads correctly if the image fails to load.
 */

import { productMark, productName } from "@/lib/studio/product-marks";

export function ProductLabel({
  product,
  size = 18,
  mutedName = false,
}: {
  /** The product key as stored — `s4hana`, not a display string. */
  product: string;
  /** Glyph edge in px. Below ~16 the symbols stop being distinguishable. */
  size?: number;
  /** Muted type, for the secondary lines under a connection label. */
  mutedName?: boolean;
}) {
  const mark = productMark(product);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      {mark?.glyph ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mark.glyph}
          alt=""
          width={size}
          height={size}
          style={{ display: "block", flexShrink: 0 }}
        />
      ) : null}
      <span
        style={{
          minWidth: 0,
          ...(mutedName ? { color: "var(--ink-muted)" } : {}),
        }}
      >
        {/*
          The NAME, never the key. These cells read `s4hana` — an identifier the
          product uses internally, and not something a consultant should have to
          translate. Where no mark exists productName falls back to the key,
          which is honest, rather than to "Unknown", which would be a claim.
        */}
        {productName(product)}
      </span>
    </span>
  );
}
