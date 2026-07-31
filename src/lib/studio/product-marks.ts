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
   * Whether a system of this product addresses an SAP client.
   *
   * MIRRORS `addressesClient` on SAP_ODATA_PRODUCTS, which is the authority. It
   * is repeated here only because that module is server-side — it reads env and
   * performs fetches — and a client component must not pull it into the browser
   * bundle. A test reconciles the two, so this mirror cannot drift silently the
   * way a hand-kept copy would.
   */
  addressesClient: boolean;
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
 * ALL SIX ARE SELECTABLE. Private cloud, on-premise and ECC were marks without
 * a product while the connector could not address a client and the catalogue
 * held no rows for their editions. Both changed — sap-url.ts carries the
 * client, and the Hub harvest carries 627 private and 673 on-premise APIs — so
 * they are products now.
 *
 * Selectable is not the same as reachable. These systems are usually not
 * internet-facing, and whether this deployment can reach a SAP Cloud Connector
 * is unresolved. A connection can be configured; the connection test is what
 * says whether it answers.
 */
export const PRODUCT_MARKS: Record<string, ProductMark> = {
  s4hana: {
    name: "SAP Cloud ERP",
    edition: "Public Cloud",
    addressesClient: false,
    glyph: "/icons/sap/glyph-cloud-erp.png",
  },
  successfactors: {
    name: "SAP SuccessFactors",
    edition: null,
    addressesClient: false,
    glyph: "/icons/sap/glyph-successfactors.png",
  },
  "cloud-erp-private": {
    name: "SAP Cloud ERP Private",
    edition: "RISE / Private Cloud",
    addressesClient: true,
    glyph: "/icons/sap/glyph-cloud-erp-private.png",
  },
  "s4hana-onprem": {
    name: "SAP S/4HANA",
    edition: "On-premise",
    addressesClient: true,
    glyph: "/icons/sap/glyph-s4hana-onprem.png",
  },
  /*
   * ECC AND s4hana-onprem NO LONGER SHARE A PICTURE. This comment used to say
   * they did, and it was right: both supplied marks were a three-unit server
   * rack, indistinguishable at 56px and more so at 20px. The replacement art
   * (#218) separates them — ECC carries an ECC hexagon badge, on-premise a
   * shield and lock.
   *
   * ProductLabel still always renders the name beside the glyph. Not because
   * the glyph is uninformative now, but because six small marks at 20px are a
   * weaker cue than the word, and the name is what a reader confirms against.
   *
   * ECC ships NO service list. Its OData depends on NetWeaver Gateway
   * being installed and the services activated, so there is no `API_*`
   * convention to assume — see SAP_ODATA_PRODUCTS. It is selectable because a
   * customer WITH Gateway is a real target; the catalogue reporting nothing is
   * the honest answer until discovery from the tenant's own Gateway catalogue
   * exists (spec §3.1).
   */
  ecc: {
    name: "SAP ERP (ECC)",
    edition: "Legacy on-premise",
    addressesClient: true,
    glyph: "/icons/sap/glyph-ecc.png",
  },
  ariba: {
    name: "SAP Ariba",
    edition: null,
    addressesClient: false,
    glyph: "/icons/sap/glyph-ariba.png",
  },
};

/**
 * Marks for products that are NOT yet supported.
 *
 * EMPTY NOW, AND KEPT ON PURPOSE. Private cloud, on-premise and ECC lived here
 * while the connector could not address a client and the catalogue held zero
 * rows for their editions. Both are now true — sap-url.ts carries the client,
 * and the 2026-07-30 Hub harvest carries 627 private and 673 on-premise APIs —
 * so they moved to PRODUCT_MARKS and became selectable.
 *
 * The map stays because the RULE it enforces still holds: a product with
 * artwork but no connector must not reach the picker, which is the same class
 * of defect as a rail entry pointing at a 404. A test keeps the two disjoint.
 */
export const UNSUPPORTED_PRODUCT_MARKS: Record<string, ProductMark> = {};

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
