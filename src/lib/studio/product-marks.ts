/**
 * How an SAP product is presented — its current name, and its mark.
 *
 * WHY NAMES AND LOGOS ARE SEPARATE CONCERNS HERE. The supplied artwork is
 * 1024×1024 marketing imagery: an opaque grey gradient, a glow, and the product
 * name rendered INTO the image. That is fine at tile size and actively harmful
 * below it — at 20px the embedded text is illegible, the grey fights the cream
 * surfaces, and it repeats a label already sitting beside it. So `logo` is
 * offered for tiles and `name` for everywhere else, rather than one asset
 * pressed into both jobs.
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
   * Path under /public, or null where no artwork exists.
   *
   * Null is meaningful: a product with no mark renders its name and nothing
   * else, rather than a broken image or a placeholder that implies one is
   * coming.
   */
  logo: string | null;
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
    logo: "/icons/sap/cloud-erp.png",
  },
  successfactors: {
    name: "SAP SuccessFactors",
    edition: null,
    logo: "/icons/sap/successfactors.png",
  },
  ariba: {
    name: "SAP Ariba",
    edition: null,
    logo: "/icons/sap/ariba.png",
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
    logo: "/icons/sap/cloud-erp-private.png",
  },
  "s4hana-onprem": {
    name: "SAP S/4HANA",
    edition: "On-premise",
    logo: "/icons/sap/s4hana-onprem.png",
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
