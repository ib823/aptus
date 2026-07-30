/**
 * How an SAP product is presented — its current name, and its mark.
 *
 * THE MARK IS THE SYMBOL, NOT THE SUPPLIED IMAGE. The artwork is 1024×1024
 * marketing imagery: a grey field, the SAP wordmark, a symbol, and the product
 * name rendered INTO the picture. Used whole it is unusable below tile size —
 * the embedded text turns to mush and the grey field fights the cream surfaces.
 *
 * But the symbol inside it sits on a transparent background, and lifted out it
 * is a genuine icon: legible at 20px in a table row and clean at 64px on a
 * tile. So each mark is the symbol alone, and the name is always real text
 * beside it — which keeps it selectable, translatable and readable to a screen
 * reader, none of which is true of a name baked into a PNG.
 *
 * THE NAMES ARE OUT OF DATE IN THE CONNECTOR, and the artwork is what revealed
 * it. SAP renamed S/4HANA Cloud Public Edition to "SAP Cloud ERP" and Private
 * Edition to "SAP Cloud ERP Private". `SAP_ODATA_PRODUCTS[].label` still says
 * "S/4HANA Cloud". That label is part of an API response, so it is left alone;
 * this is a presentation layer over it, and the two are reconciled by a test
 * rather than by hoping.
 *
 * The Connections table showed the raw key — `s4hana` — with no label at all.
 * That, not the absence of a picture, was the readability problem.
 */

export interface ProductMark {
  /** SAP's current name for the product. */
  name: string;
  /** The edition qualifier SAP uses, e.g. "Public Cloud". Null when there is none. */
  edition: string | null;
  /**
   * Path under /public to the transparent symbol, or null where none exists.
   *
   * Null is meaningful: a product with no mark renders its name and nothing
   * else, rather than a broken image or a placeholder that implies one is
   * coming.
   */
  glyph: string | null;
}

/**
 * Keyed by the product key used throughout the connector and the API.
 *
 * `s4hana` is the live one. `cloud-erp-private` and `s4hana-onprem` have marks
 * but no product entry yet — see docs/coreedge-sap-target-expansion-spec.md.
 * They are listed so the artwork has a home and so the gap between "we have a
 * logo" and "we support it" is visible in one place instead of implied.
 */
export const PRODUCT_MARKS: Record<string, ProductMark> = {
  s4hana: {
    name: "SAP Cloud ERP",
    edition: "Public Cloud",
    glyph: "/icons/sap/glyph-cloud-erp.png",
  },
  successfactors: {
    name: "SAP SuccessFactors",
    edition: null,
    glyph: "/icons/sap/glyph-successfactors.png",
  },
  ariba: {
    name: "SAP Ariba",
    edition: null,
    glyph: "/icons/sap/glyph-ariba.png",
  },
};

/**
 * Marks for products that are NOT yet supported.
 *
 * Deliberately separate from PRODUCT_MARKS. Merging them would let a picker
 * offer a product the connector cannot serve — the same class of defect as a
 * rail entry pointing at a 404, which this codebase has already paid for once.
 */
export const UNSUPPORTED_PRODUCT_MARKS: Record<string, ProductMark> = {
  "cloud-erp-private": {
    name: "SAP Cloud ERP Private",
    edition: "RISE / Private Cloud",
    glyph: "/icons/sap/glyph-cloud-erp-private.png",
  },
  "s4hana-onprem": {
    name: "SAP S/4HANA",
    edition: "On-premise",
    glyph: "/icons/sap/glyph-s4hana-onprem.png",
  },
  /*
   * ECC and s4hana-onprem SHARE A PICTURE. Both supplied marks are a three-unit
   * server rack, indistinguishable at 56px and more so at 20px. The glyph tells
   * a reader nothing here; the name beside it does the work, which is why
   * ProductLabel always renders one.
   *
   * ECC is also further from support than the other two: without NetWeaver
   * Gateway it exposes no OData at all, so there is no $metadata, no entity set
   * and nothing the honest-status vocabulary can probe. See
   * docs/coreedge-sap-target-expansion-spec.md §2.2 — it needs a qualifying
   * question answered before it is a target rather than an idea.
   */
  ecc: {
    name: "SAP ERP (ECC)",
    edition: "Legacy on-premise",
    glyph: "/icons/sap/glyph-ecc.png",
  },
};

/**
 * The name to show for a product key.
 *
 * Falls back to the key itself rather than to "Unknown". A key that has no mark
 * is still a real product the caller configured, and showing `s4hana` is honest
 * where showing "Unknown product" would be wrong.
 */
export function productName(key: string): string {
  return PRODUCT_MARKS[key]?.name ?? UNSUPPORTED_PRODUCT_MARKS[key]?.name ?? key;
}

/** The full mark, or null when the key has none. */
export function productMark(key: string): ProductMark | null {
  return PRODUCT_MARKS[key] ?? UNSUPPORTED_PRODUCT_MARKS[key] ?? null;
}
