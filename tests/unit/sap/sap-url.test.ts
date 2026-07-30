/**
 * The one URL builder, and the four call sites that must all use it.
 *
 * WHY THIS MATTERS MORE THAN A USUAL HELPER. `sap-client` decides WHICH DATA
 * CONTAINER a call lands in. On an on-premise system X5M/100 and X5M/080 are
 * different companies' worth of data at the SAME baseUrl. A call that forgets
 * the parameter does not fail — it succeeds, against whatever client the system
 * defaults to. There is no error to notice.
 *
 * So the risk is not "the builder is wrong", it is "one of four call sites did
 * not use it". Both are tested here.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSapUrl, isValidSapClient } from "@/lib/sap-public/sap-url";
import { SAP_ODATA_PRODUCTS } from "@/lib/sap-public/tdd-connector";
import { stripSource } from "../../helpers/source";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => stripSource(readFileSync(resolve(ROOT, p), "utf8"), "comments");

const BASE = "https://my403706-api.s4hana.cloud.sap";

describe("a connection with no client produces exactly what it produces today", () => {
  /*
   * THE WHOLE POINT OF THIS SET. Every live connection is S/4HANA Cloud Public,
   * which has no client. If routing them through the builder changed a single
   * byte, this change would be a rewrite of the working path dressed as a
   * refactor.
   */
  it("leaves a plain path untouched", () => {
    expect(buildSapUrl({ baseUrl: BASE, path: "/sap/opu/odata/sap/API_X" })).toBe(
      `${BASE}/sap/opu/odata/sap/API_X`,
    );
  });

  it("treats null and undefined alike — both mean 'this product has no client'", () => {
    const withNull = buildSapUrl({ baseUrl: BASE, path: "/p", client: null });
    const withUndef = buildSapUrl({ baseUrl: BASE, path: "/p", client: undefined });
    expect(withNull).toBe(`${BASE}/p`);
    expect(withUndef).toBe(withNull);
  });

  it("reproduces the read path's query byte for byte", () => {
    // Was: `${baseUrl}${servicePath}/${entitySet}?$top=${limit}&$format=json`
    expect(
      buildSapUrl({
        baseUrl: BASE,
        path: "/sap/opu/odata/sap/API_X/A_Item",
        query: { $top: 25, $format: "json" },
      }),
    ).toBe(`${BASE}/sap/opu/odata/sap/API_X/A_Item?$top=25&$format=json`);
  });

  it("does not percent-encode the OData $ prefix", () => {
    // URLSearchParams would. That is why the query is assembled by hand.
    const url = buildSapUrl({ baseUrl: BASE, path: "/p", query: { $top: 1 } });
    expect(url).toContain("$top=1");
    expect(url).not.toContain("%24");
  });
});

describe("a connection with a client carries it on every call", () => {
  it("appends sap-client when there is no other query", () => {
    expect(buildSapUrl({ baseUrl: BASE, path: "/p", client: "100" })).toBe(
      `${BASE}/p?sap-client=100`,
    );
  });

  it("joins with & when the caller already has a query", () => {
    expect(
      buildSapUrl({ baseUrl: BASE, path: "/p", client: "080", query: { $format: "json" } }),
    ).toBe(`${BASE}/p?$format=json&sap-client=080`);
  });

  it("joins with & when the PATH already carries a query", () => {
    // A service path with $expand baked in would otherwise produce a second '?'.
    expect(buildSapUrl({ baseUrl: BASE, path: "/p?$expand=To_Item", client: "100" })).toBe(
      `${BASE}/p?$expand=To_Item&sap-client=100`,
    );
  });

  it("never puts the client before the path", () => {
    /*
     * THE MALFORMATION THIS EXISTS TO PREVENT. Folding the client into baseUrl
     * yields `https://host?sap-client=100` + `/sap/opu/...` — a query followed
     * by a path, which is not a URL. It must be applied after the join.
     */
    const url = buildSapUrl({ baseUrl: BASE, path: "/sap/opu/odata", client: "100" });
    expect(url.indexOf("/sap/opu/odata")).toBeLessThan(url.indexOf("sap-client"));
    expect(url).not.toMatch(/\?[^/]*\//);
  });
});

describe("the client is never applied twice", () => {
  it("leaves a URL that already carries sap-client alone", () => {
    /*
     * SAP echoes `sap-client` into the Location header of a create, and that
     * header is fed straight back in for the follow-up DELETE. A second copy
     * gives `?sap-client=100&sap-client=100`, which SAP is under no obligation
     * to resolve the way the caller assumed.
     */
    expect(buildSapUrl({ baseUrl: BASE, path: "/p?sap-client=100", client: "100" })).toBe(
      `${BASE}/p?sap-client=100`,
    );
  });

  it("does not add a second copy even when the clients DISAGREE", () => {
    // Refusing to guess. Silently overriding what SAP addressed, or appending a
    // conflicting second value, both risk deleting from a different container
    // than the one just written.
    expect(buildSapUrl({ baseUrl: BASE, path: "/p?sap-client=080", client: "100" })).toBe(
      `${BASE}/p?sap-client=080`,
    );
  });

  it("uses an absolute Location verbatim, without re-addressing it", () => {
    const src = read("src/lib/sap-public/tdd-connector.ts");
    expect(src).toContain('location.startsWith("http")');
  });
});

describe("the client is validated where it is written, not where it is read", () => {
  it("accepts the three-digit form SAP uses", () => {
    for (const ok of ["000", "100", "080", "999"]) expect(isValidSapClient(ok)).toBe(true);
  });

  it("rejects what would silently change the URL's meaning", () => {
    for (const bad of ["1", "1000", "10a", "", " 100", "100&x=1"]) {
      expect(isValidSapClient(bad), bad).toBe(false);
    }
  });

  it("still encodes at build time, because a column is not a validator", () => {
    // The value arrives from the database. A column that SHOULD hold digits is
    // not the same as one that does.
    expect(buildSapUrl({ baseUrl: BASE, path: "/p", client: "1&x=2" })).toContain(
      "sap-client=1%26x%3D2",
    );
  });
});

describe("all five SAP call sites route through the builder", () => {
  /*
   * The builder being correct is worth little if one caller still concatenates.
   * Forgetting it on the WRITE path while remembering it on the read path means
   * reading one client and writing to another, with both calls returning 200.
   */
  const SITES = [
    ["src/lib/sap-public/tdd-connector.ts", "catalogue probe and preview"],
    ["src/lib/studio/connection-health.ts", "the connection test"],
    ["src/lib/northbound/read.ts", "runtime read"],
    ["src/lib/northbound/write.ts", "runtime write"],
  ] as const;

  /*
   * A FIFTH SITE existed and was missed on the first pass — the DELETE in
   * deleteSapEntityByLocation, which builds from SAP's own Location header. It
   * is covered by the concatenation sweep below rather than by name, because
   * naming four sites is exactly how the fifth stayed hidden.
   */

  it.each(SITES)("%s (%s) uses buildSapUrl", (file) => {
    expect(read(file)).toContain("buildSapUrl");
  });

  it.each(SITES)("%s no longer concatenates baseUrl with a path", (file) => {
    const src = read(file);
    // `${x.baseUrl}${...}` or `${x.baseUrl}/...` — the shape that was there before.
    expect(src, `${file} still builds a URL by hand`).not.toMatch(
      /\$\{[A-Za-z_$][\w$.]*\.baseUrl\}\s*(?:\$\{|\/)/,
    );
  });

  it("applies the client to the write path's CSRF fetch as well as the POST", () => {
    /*
     * Two upstream calls, and BOTH must land in the same client. A handshake
     * against one client followed by a POST to another is refused by SAP at
     * best, and accepted against the wrong data container at worst.
     *
     * This also pins the bug that nearly shipped: `base` was built once WITH the
     * client, then had "/" appended for the handshake, producing
     * `...?sap-client=100/`. Hence a function, applied per call.
     */
    const src = read("src/lib/northbound/write.ts");
    const calls = src.match(/sapUrl\(/g) ?? [];
    expect(calls.length, "both the CSRF fetch and the POST must build their own URL").toBe(2);
    expect(src, "a prebuilt base string would take a suffix after the query").not.toMatch(
      /\$\{base\}/,
    );
  });
});

describe("the API refuses a client on a product that has none", () => {
  /*
   * S/4HANA Cloud Public, SuccessFactors and Ariba are one tenant per host.
   * Accepting `client: "100"` on one of them would append `?sap-client=100` to
   * every call to a system with no such concept — ignored at best, a 400 on a
   * connection that worked a moment ago at worst.
   *
   * Refused at the boundary rather than dropped silently: a value the caller
   * supplied and the system discarded is the kind of difference nobody finds
   * until they are debugging something else.
   */
  const ROUTE = read("src/app/api/studio/connections/route.ts");

  it("names the products that may carry one, rather than checking nothing", () => {
    expect(ROUTE).toContain("PRODUCTS_WITH_CLIENT");
    expect(ROUTE).toMatch(/PRODUCTS_WITH_CLIENT\.has\(v\.product\)/);
  });

  it("derives the set from the products, rather than keeping a second list", () => {
    /*
     * This asserted the set was EMPTY, with a note that on-premise and RISE must
     * arrive by adding a key rather than by deleting the guard. They have now
     * arrived — and neither happened. The set is derived from `addressesClient`
     * on SAP_ODATA_PRODUCTS, so there is no second list to add a key to and
     * none to forget.
     */
    expect(ROUTE).toMatch(/SAP_ODATA_PRODUCTS\s*\.?\s*\n?\s*\.filter\(\(p\) => p\.addressesClient\)/);
    expect(ROUTE, "a hand-kept literal is back").not.toMatch(
      /PRODUCTS_WITH_CLIENT\s*=\s*new Set<string>\(\[["']/,
    );
  });

  it("still refuses a client on a product that has none", () => {
    // The rule did not relax when the set stopped being empty: Cloud ERP,
    // SuccessFactors and Ariba are one tenant per host and must still refuse.
    const cloudOnly = SAP_ODATA_PRODUCTS.filter((p) => !p.addressesClient);
    expect(cloudOnly.map((p) => p.key)).toContain("s4hana");
    expect(cloudOnly.map((p) => p.key)).toContain("successfactors");
  });

  it("marks on-premise, RISE and ECC as addressing a client", () => {
    const withClient = SAP_ODATA_PRODUCTS.filter((p) => p.addressesClient).map((p) => p.key);
    expect(withClient).toEqual(
      expect.arrayContaining(["cloud-erp-private", "s4hana-onprem", "ecc"]),
    );
  });

  it("validates the shape too, not only the product", () => {
    expect(ROUTE).toContain("isValidSapClient");
  });

  it("persists on BOTH the create and the update branch of the upsert", () => {
    /*
     * The upsert has two branches. Wiring only `create` would leave an edited
     * connection carrying whichever client it had before — a stale value
     * silently deciding which data container the next write lands in.
     */
    const resolver = read("src/lib/sap-public/connection-resolver.ts");
    const upsert = resolver.slice(resolver.indexOf("export async function upsertSapConnection"));
    const body = upsert.slice(0, upsert.indexOf("return redactConnection"));
    expect((body.match(/client: input\.client \?\? null/g) ?? []).length).toBe(2);
  });
});
