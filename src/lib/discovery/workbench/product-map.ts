/**
 * ABeam Workbench — C6 product map (THE FENCE).
 *
 * ⚠ CONSULTANT-ONLY. Brief §6B.8 / §7-C6 / §8 / §9.2 / §12.6 all say the same
 * thing: this must never appear on, or be reachable from, any client surface.
 * The dependency-boundary test proves the import half; this module simply must
 * never be imported by anything under (external).
 *
 * THE SAP COLUMN IS DERIVED, NOT STORED.
 *   origin = "sap-base"  → the process came from the base catalogue, so its
 *                          scope_id IS the reference. Mapped, by construction.
 *   origin = "overlay"   → ABeam authored it; no base reference exists. Honest
 *                          empty, never a fabricated fill.
 *
 * That is why DiscoveryProductMap stores only the hand-entered Oracle/NetSuite
 * refs. The .dc's entire Rosetta comes from a fixture literally named
 * `product_map_mock` — every SAP ref, every mapped state, every coverage
 * percentage in the prototype is invented, while its caption claims "SAP
 * populated from the discovery library". Deriving means the claim is true: the
 * table cannot manufacture a mapping the library does not support.
 */

import { prisma } from "@/lib/db/prisma";
import { libraryRows, type LibraryRow } from "./library";

/** The three products the brief's Rosetta names, plus the "other" column (§6B.8). */
export const PRODUCTS = ["sap", "oracle", "netsuite", "other"] as const;
export type Product = (typeof PRODUCTS)[number];

export const PRODUCT_LABELS: Record<Product, string> = {
  sap: "SAP",
  oracle: "Oracle",
  netsuite: "NetSuite",
  other: "Other",
};

export interface ProductCell {
  /** The building-block reference, or null for an honest "to map" slot. */
  ref: string | null;
  /** Derived cells cannot be edited — the library is the authority. */
  derived: boolean;
}

export interface ProductMapRow {
  scopeId: string;
  name: string;
  streamName: string;
  origin: LibraryRow["origin"];
  cells: Record<Product, ProductCell>;
}

export interface ProductCoverage {
  product: Product;
  label: string;
  mapped: number;
  total: number;
  /** 0–1. Computed, never a fixture. */
  share: number;
}

interface StoredMap {
  processId: string;
  oracleRef: string | null;
  netsuiteRef: string | null;
  otherRef: string | null;
}

/**
 * Build the matrix. `stored` comes from DiscoveryProductMap; everything about
 * SAP comes from the library.
 */
export function buildProductMap(stored: StoredMap[]): ProductMapRow[] {
  const byId = new Map(stored.map((s) => [s.processId, s]));
  return libraryRows().map((r) => {
    const s = byId.get(r.scope_id);
    return {
      scopeId: r.scope_id,
      name: r.name,
      streamName: r.streamName,
      origin: r.origin,
      cells: {
        // Derived: base-catalogue processes are referenced by their own id.
        // Overlay processes have no base reference and must show as unmapped.
        sap: { ref: r.origin === "sap-base" ? r.scope_id : null, derived: true },
        oracle: { ref: s?.oracleRef ?? null, derived: false },
        netsuite: { ref: s?.netsuiteRef ?? null, derived: false },
        other: { ref: s?.otherRef ?? null, derived: false },
      },
    };
  });
}

/** Per-product coverage meters (§6B.8) — computed from the rows above. */
export function productCoverage(rows: ProductMapRow[]): ProductCoverage[] {
  return PRODUCTS.map((p) => {
    const mapped = rows.filter((r) => r.cells[p].ref !== null).length;
    return {
      product: p,
      label: PRODUCT_LABELS[p],
      mapped,
      total: rows.length,
      share: rows.length > 0 ? mapped / rows.length : 0,
    };
  });
}

export async function loadProductMap(): Promise<ProductMapRow[]> {
  const stored = await prisma.discoveryProductMap.findMany({
    select: { processId: true, oracleRef: true, netsuiteRef: true, otherRef: true },
  });
  return buildProductMap(stored);
}
