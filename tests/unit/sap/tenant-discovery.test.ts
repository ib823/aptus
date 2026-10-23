// @vitest-environment node
/**
 * P1.2 acceptance A1, without a live lab: the lab's Z* and YY1_* services
 * appear as customer-built. Over the synthetic lab-shape fixture
 * (tests/fixtures/tenant-discovery/catalogservice-v2.lab-shape.json, marked
 * synthetic until the first live listing replaces it), the classes, the
 * derived paths (same-origin, relative, cross-origin), and a hostile page.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  classifyService,
  customerBuilt,
  entriesWithinStoredBound,
  groupListing,
  LISTING_LIMITS,
  parseServiceCollectionPage,
  parseV4ServiceGroups,
  readStoredEntries,
  SAP_NAMESPACES,
  servicePathFromEntry,
  sourceIdOf,
  type CatalogueEntry,
  type ClassificationIndex,
  type ListingEntry,
  type ListingLimits,
} from "@/lib/sap-public/tenant-discovery";

const ROOT = path.resolve(__dirname, "../../..");
const LAB = readFileSync(path.join(ROOT, "tests/fixtures/tenant-discovery/catalogservice-v2.lab-shape.json"), "utf8");
const CONNECTION = { baseUrl: "https://lab.example.invalid" };

/** The ids SAP's 2608 table names, as written, read from the committed file (the database's own rows come from it). */
function scenarioTableIdsAsWritten(): Set<string> {
  const ids = new Set<string>();
  for (const line of readFileSync(path.join(ROOT, "sap-references/comm-scenarios/comm-scenarios.tsv"), "utf8").split("\n")) {
    if (line.startsWith("#") || line.startsWith("comm_scenario_id")) continue;
    for (const a of (line.split("\t")[6] ?? "").split("|")) if (a.trim()) ids.add(a.trim());
  }
  return ids;
}

const scenarioTableIds = () => new Set([...scenarioTableIdsAsWritten()].map((id) => id.toUpperCase()));

const INDEX: ClassificationIndex = { published: new Set(), inScenarioTable: scenarioTableIds() };

describe("the lab-shape listing (A1)", () => {
  const page = parseServiceCollectionPage(LAB)!;
  const byId = new Map(page.entries.map((e) => [e.id, e]));

  it("reads every entry, by its key", () => {
    expect(page.dropped).toBe(0);
    expect([...byId.keys()].sort()).toEqual(
      [
        "ZUI_TRAVEL_O2_0001",
        "Z_BONUS_PLAN_0001",
        "YY1_SALESBONUS_CDS_0001",
        "API_BUSINESS_PARTNER_0001",
        "C_PURCHASEORDER_FS_SRV_0001",
        "/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV_0001",
        "/ACME/ORDERS_SRV_0001",
        "/IWFND/SG_MED_CATALOG_0002",
      ].sort(),
    );
    expect(byId.get("/IWFND/SG_MED_CATALOG_0002")).toMatchObject({ technicalName: "/IWFND/SG_MED_CATALOG", version: "0002" });
  });

  it("classifies the lab's Z* and YY1_* services as customer-built, and SAP's by its own sources", () => {
    const cls = (id: string) => classifyService(byId.get(id)!, INDEX);
    expect(cls("ZUI_TRAVEL_O2_0001")).toBe("CUSTOMER_DEVELOPER");
    expect(cls("Z_BONUS_PLAN_0001")).toBe("CUSTOMER_DEVELOPER");
    expect(cls("YY1_SALESBONUS_CDS_0001")).toBe("CUSTOMER_KEY_USER");
    // In SAP's 2608 table: product documentation, so Published (API Policy §1.1).
    expect(cls("API_BUSINESS_PARTNER_0001")).toBe("PUBLISHED");
    expect(cls("/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV_0001")).toBe("PUBLISHED");
    expect(cls("/IWFND/SG_MED_CATALOG_0002")).toBe("PUBLISHED");
    // A Fiori UI service SAP does not publish for integration.
    expect(cls("C_PURCHASEORDER_FS_SRV_0001")).toBe("SAP_UNPUBLISHED");
    // A namespace SAP's sources do not use: a partner's or the customer's.
    expect(cls("/ACME/ORDERS_SRV_0001")).toBe("UNKNOWN_NAMESPACE");
  });

  it("derives a path only on the connection's own origin, without the query", () => {
    const pathOf = (id: string) => servicePathFromEntry(byId.get(id)!, CONNECTION);
    // Same origin, absolute: the path, sap-client dropped, the trailing slash normalised.
    expect(pathOf("ZUI_TRAVEL_O2_0001")).toBe("/sap/opu/odata/sap/ZUI_TRAVEL_O2");
    // Another host: no path, and so no Register action.
    expect(pathOf("Z_BONUS_PLAN_0001")).toBeNull();
    // Relative: resolved against the connection.
    expect(pathOf("YY1_SALESBONUS_CDS_0001")).toBe("/sap/opu/odata/sap/YY1_SALESBONUS_CDS");
    // No ServiceUrl: Gateway's V2 convention, its namespace and version.
    expect(pathOf("/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV_0001")).toBe("/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV");
    expect(pathOf("/IWFND/SG_MED_CATALOG_0002")).toBe("/sap/opu/odata/IWFND/SG_MED_CATALOG;v=0002");
  });

  it("groups the listing as the screen shows it", () => {
    const entries = page.entries.map((e) => ({ ...e, class: classifyService(e, INDEX) }));
    const groups = groupListing(entries);
    expect(groups.customerBuilt.map((e) => e.id).sort()).toEqual(["YY1_SALESBONUS_CDS_0001", "ZUI_TRAVEL_O2_0001", "Z_BONUS_PLAN_0001"]);
    expect(groups.published).toHaveLength(3);
    expect(groups.sapUnpublished.map((e) => e.id)).toEqual(["C_PURCHASEORDER_FS_SRV_0001"]);
    expect(groups.unknown.map((e) => e.id)).toEqual(["/ACME/ORDERS_SRV_0001"]);
  });
});

describe("the classifier's rules", () => {
  const entry = (technicalName: string, odataVersion: "V2" | "V4" = "V2"): CatalogueEntry => ({
    id: odataVersion === "V2" ? `${technicalName}_0001` : `${technicalName}/SVC/0001`,
    technicalName,
    version: "0001",
    odataVersion,
    serviceUrl: null,
    title: null,
  });

  it("customer prefixes win before any source is consulted", () => {
    const all: ClassificationIndex = { published: new Set(["YY1_X_CDS_0001", "ZX_0001"]), inScenarioTable: new Set() };
    expect(classifyService(entry("YY1_X_CDS"), all)).toBe("CUSTOMER_KEY_USER");
    expect(classifyService(entry("ZX"), all)).toBe("CUSTOMER_DEVELOPER");
    expect(classifyService(entry("YX_SRV"), all)).toBe("CUSTOMER_DEVELOPER");
    expect(customerBuilt("/ZNS/ZX")).toBeNull();
  });

  it("a catalogue or curated id is Published, an SAP namespace without one is not", () => {
    const index: ClassificationIndex = { published: new Set(["API_X_SRV_0001", "API_PO_2_G4BA"]), inScenarioTable: new Set() };
    expect(classifyService(entry("API_X_SRV"), index)).toBe("PUBLISHED");
    expect(classifyService(entry("API_PO_2", "V4"), index)).toBe("PUBLISHED");
    expect(classifyService(entry("/SCWM/UNLISTED_SRV"), index)).toBe("SAP_UNPUBLISHED");
    expect(classifyService(entry("/PARTNER/X_SRV"), index)).toBe("UNKNOWN_NAMESPACE");
    expect(classifyService(entry("UI_SOMETHING"), index)).toBe("SAP_UNPUBLISHED");
  });

  it("a V4 entry is known by its service group with _G4BA, as SAP's table names it", () => {
    expect(sourceIdOf({ id: "API_PURCHASEORDER_2/PURCHASEORDER/0001", technicalName: "API_PURCHASEORDER_2", odataVersion: "V4" })).toBe(
      "API_PURCHASEORDER_2_G4BA",
    );
  });

  it("every upper-case namespace in SAP's 2608 table is an SAP namespace here", () => {
    // As written: a lower-case /sap/… or /core/… is a REST or SOAP path, not a Gateway namespace.
    const table = [...scenarioTableIdsAsWritten()].map((id) => /^\/([A-Z0-9_]+)\//.exec(id)?.[1]).filter((n): n is string => !!n);
    for (const ns of new Set(table)) expect(SAP_NAMESPACES.has(ns), ns).toBe(true);
  });
});

describe("a listed address is never trusted", () => {
  const v2 = (serviceUrl: string | null, technicalName = "ZX_SRV"): CatalogueEntry => ({
    id: `${technicalName}_0001`,
    technicalName,
    version: "0001",
    odataVersion: "V2",
    serviceUrl,
    title: null,
  });

  it.each([
    ["the instance metadata address", "http://169.254.169.254/latest/meta-data/"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/plain,x"],
    ["a protocol-relative host", "//evil.example/sap/opu/odata/sap/ZX_SRV"],
    ["credentials in the URL", "https://user:pw@lab.example.invalid/sap/opu/odata/sap/ZX_SRV"],
    ["another port", "https://lab.example.invalid:8443/sap/opu/odata/sap/ZX_SRV"],
    ["a dot segment out of the root", "/sap/opu/odata/../../bc/adt/discovery"],
    ["an ICF handler", "/sap/bc/soap/rfc"],
    ["a routing parameter", "/sap/opu/odata/sap/ZX_SRV;o=OTHER"],
  ])("refuses %s", (_label, serviceUrl) => {
    expect(servicePathFromEntry(v2(serviceUrl), CONNECTION)).toBeNull();
  });

  it("keeps only paths under a base URL that has one", () => {
    const conn = { baseUrl: "https://lab.example.invalid/prefix" };
    expect(servicePathFromEntry(v2("https://lab.example.invalid/prefix/sap/opu/odata/sap/ZX_SRV/"), conn)).toBe("/sap/opu/odata/sap/ZX_SRV");
    expect(servicePathFromEntry(v2("https://lab.example.invalid/sap/opu/odata/sap/ZX_SRV/"), conn)).toBeNull();
  });

  it("never guesses a V4 path", () => {
    expect(
      servicePathFromEntry({ technicalName: "ZUI_X_O4", version: "0001", odataVersion: "V4", serviceUrl: null }, CONNECTION),
    ).toBeNull();
  });
});

describe("a hostile page", () => {
  it("reads at most a page of entries and drops what does not parse", () => {
    const results = Array.from({ length: 6_000 }, (_, i) => ({ ID: `ZSRV${i}_0001` }));
    const page = parseServiceCollectionPage(JSON.stringify({ d: { results } }))!;
    expect(page.entries).toHaveLength(LISTING_LIMITS.pageSize);
    expect(page.listed).toBe(6_000);
  });

  it("caps every string, ignores unknown keys and __proto__, and survives deep nesting", () => {
    const deep = `${"[".repeat(100_000)}"x"${"]".repeat(100_000)}`;
    const text = JSON.stringify({
      d: {
        results: [
          { ID: "ZHUGE_0001", Title: "t".repeat(2 * 1024 * 1024), Extra: "@DEEP@" },
          { ID: "x".repeat(10_000) },
          { ID: "ZBAD;o=X_0001" },
          { NoId: true },
          JSON.parse('{"ID":"ZPROTO_0001","__proto__":{"polluted":true}}'),
        ],
      },
    });
    const page = parseServiceCollectionPage(text.replace('"@DEEP@"', deep))!;
    expect(page.entries.map((e) => e.id)).toEqual(["ZHUGE_0001", "ZPROTO_0001"]);
    expect(page.dropped).toBe(3);
    expect(page.entries[0]!.title!.length).toBeLessThanOrEqual(200);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(page.entries[1])).toBe(Object.prototype);
  });

  it("is not a page when it is not OData's JSON", () => {
    expect(parseServiceCollectionPage("<html>login</html>")).toBeNull();
    expect(parseServiceCollectionPage(JSON.stringify({ value: [] }))).toBeNull();
    expect(parseServiceCollectionPage("{")).toBeNull();
  });
});

describe("the V4 service groups", () => {
  it("reads each service of each group, its address only from ServiceUrl", () => {
    const page = parseV4ServiceGroups(
      JSON.stringify({
        value: [
          {
            GroupId: "ZUI_TRAVEL_O4",
            DefaultSystem: {
              Services: [
                { ServiceId: "ZUI_TRAVEL_O4", ServiceVersion: "0001", ServiceUrl: "../../../../../../../../../sap/opu/odata4/sap/zui_travel_o4/srvd/sap/zui_travel_o4/0001/" },
                { ServiceId: "BAD SERVICE", ServiceVersion: "0001" },
              ],
            },
          },
        ],
      }),
    )!;
    expect(page.entries).toHaveLength(1);
    expect(page.dropped).toBe(1);
    const [e] = page.entries;
    expect(e).toMatchObject({ technicalName: "ZUI_TRAVEL_O4", odataVersion: "V4", version: "0001" });
    const requestUrl = `${CONNECTION.baseUrl}/sap/opu/odata4/iwfnd/config/default/iwfnd/catalog/0002/ServiceGroups`;
    expect(servicePathFromEntry(e!, CONNECTION, requestUrl)).toBe("/sap/opu/odata4/sap/zui_travel_o4/srvd/sap/zui_travel_o4/0001");
  });
});

describe("what is stored", () => {
  const stored = (i: number): ListingEntry => ({
    id: `ZSRV${i}_0001`,
    technicalName: `ZSRV${i}`,
    version: "0001",
    odataVersion: "V2",
    path: `/sap/opu/odata/sap/ZSRV${i}`,
    title: "t".repeat(200),
    class: "CUSTOMER_DEVELOPER",
    catalogueExternalId: null,
    scenarioIds: [],
  });

  it("is cut to its byte bound, and says how many went", () => {
    const all = Array.from({ length: 5_000 }, (_, i) => stored(i));
    const { entries, cut } = entriesWithinStoredBound(all);
    expect(new TextEncoder().encode(JSON.stringify(entries)).byteLength).toBeLessThanOrEqual(LISTING_LIMITS.storedBytes);
    expect(cut).toBe(all.length - entries.length);
    expect(cut).toBeGreaterThan(0);
  });

  it("keeps what a builder can act on when the bound cuts: customer-built, then Published, then unknown, SAP's unpublished last", () => {
    const of = (cls: ListingEntry["class"], prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...stored(i), id: `${prefix}${i}_0001`, technicalName: `${prefix}${i}`, class: cls }));
    // Gateway pages ServiceCollection by key, so Y*, YY1_* and Z* come last.
    const sap = of("SAP_UNPUBLISHED", "C_SRV", 4_000);
    const published = of("PUBLISHED", "API_SRV", 100);
    const unknown = of("UNKNOWN_NAMESPACE", "/ACME/SRV", 50);
    const keyUser = of("CUSTOMER_KEY_USER", "YY1_SRV", 50);
    const developer = of("CUSTOMER_DEVELOPER", "ZSRV", 800);
    const { entries, cut } = entriesWithinStoredBound([...sap, ...published, ...unknown, ...keyUser, ...developer]);
    expect(cut).toBeGreaterThan(0);
    expect(new TextEncoder().encode(JSON.stringify(entries)).byteLength).toBeLessThanOrEqual(LISTING_LIMITS.storedBytes);
    const kept = new Set(entries.map((e) => e.id));
    for (const e of [...keyUser, ...developer, ...published, ...unknown]) expect(kept.has(e.id), e.id).toBe(true);
    // Only SAP's unpublished services were cut, from the end of the catalogue's order.
    const keptSap = entries.filter((e) => e.class === "SAP_UNPUBLISHED");
    expect(keptSap.length).toBe(sap.length - cut);
    expect(keptSap.map((e) => e.id)).toEqual(sap.slice(0, keptSap.length).map((e) => e.id));
  });

  it("is read back only as this build understands it", () => {
    expect(readStoredEntries([stored(1), { id: "x", class: "SOMETHING_NEW" }, null])).toEqual([stored(1)]);
    expect(readStoredEntries("not an array")).toEqual([]);
  });
});

describe("listGatewayCatalogue: the connector's listing (no live lab)", () => {
  const tenant = {
    key: "lab",
    label: "Lab",
    baseUrl: "https://lab.example.invalid",
    authHeaders: async () => ({ Authorization: "Basic dGVzdDp0ZXN0" }),
  };
  const page = (ids: string[], extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ d: { results: ids.map((ID) => ({ ID })), ...extra } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const limits: ListingLimits = { ...LISTING_LIMITS, pageSize: 2 };

  async function list(fetchImpl: (url: string, init: RequestInit) => Response | Promise<Response>, options: { v4?: boolean; limits?: ListingLimits } = {}) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(fetchImpl(url, init));
    });
    try {
      const { listGatewayCatalogue } = await import("@/lib/sap-public/tdd-connector");
      return { result: await listGatewayCatalogue("S4_TDD", tenant, { limits, ...options }), calls };
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it("pages with its own $skip until a short page, never following __next or a redirect", async () => {
    const { result, calls } = await list((url) => {
      const skip = Number(/\$skip=(\d+)/.exec(url)![1]);
      return skip === 0
        ? page(["ZA_0001", "ZB_0001"], { __next: "http://169.254.169.254/next" })
        : page(["ZC_0001"]);
    });
    expect(result.status).toBe("OK");
    expect(result.truncated).toBe(false);
    expect(result.entries.map((e) => e.id)).toEqual(["ZA_0001", "ZB_0001", "ZC_0001"]);
    expect(calls.map((c) => c.url)).toEqual([
      "https://lab.example.invalid/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection?$format=json&$top=2&$skip=0",
      "https://lab.example.invalid/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection?$format=json&$top=2&$skip=2",
    ]);
    expect(calls.every((c) => c.init.redirect === "manual")).toBe(true);
    // What leaves the connector is a path, never the listed URL.
    expect(JSON.stringify(result)).not.toContain("http");
  });

  it("stops at its page limit and says the list is incomplete", async () => {
    const { result, calls } = await list(() => page(["ZA_0001", "ZB_0001"]), { limits: { ...limits, maxPages: 3 } });
    expect(calls).toHaveLength(3);
    expect(result.status).toBe("TRUNCATED");
    expect(result.truncated).toBe(true);
  });

  it("stops at its entry limit", async () => {
    const { result } = await list(() => page(["ZA_0001", "ZB_0001"]), { limits: { ...limits, maxEntries: 3 } });
    expect(result.entries).toHaveLength(3);
    expect(result.status).toBe("TRUNCATED");
  });

  it.each([
    [403, "UNAUTHORIZED"],
    [401, "UNAUTHORIZED"],
    [302, "UNAUTHORIZED"],
    [404, "NOT_FOUND"],
    [500, "ERROR"],
  ] as const)("a first page answered %i is %s, with no entries", async (status, expected) => {
    const { result } = await list(() => new Response("", { status, headers: status === 302 ? { location: "https://idp.example/login" } : {} }));
    expect(result.status).toBe(expected);
    expect(result.entries).toEqual([]);
    expect(result.answers).toEqual([status]);
  });

  it("keeps what was read when a later page fails, as TRUNCATED", async () => {
    const { result } = await list((url) => (/\$skip=0/.test(url) ? page(["ZA_0001", "ZB_0001"]) : new Response("", { status: 503 })));
    expect(result.status).toBe("TRUNCATED");
    expect(result.entries).toHaveLength(2);
    expect(result.answers).toEqual([200, 503]);
  });

  it("refuses a page past its byte bound without parsing it", async () => {
    const { result } = await list(() => page(["ZA_0001"], { padding: "x".repeat(4096) }), { limits: { ...limits, pageBytes: 1024 } });
    expect(result.status).toBe("TRUNCATED");
    expect(result.entries).toEqual([]);
  });

  it("is not a page when the body is not OData's JSON (a login page with 200)", async () => {
    const { result } = await list(() => new Response("<html>sign in</html>", { status: 200 }));
    expect(result.status).toBe("ERROR");
  });

  it("asks the V4 catalogue only when told to", async () => {
    const v4Body = JSON.stringify({ value: [{ GroupId: "ZUI_X_O4", DefaultSystem: { Services: [{ ServiceId: "ZUI_X_O4", ServiceVersion: "0001" }] } }] });
    const handler = (url: string) =>
      url.includes("/odata4/") ? new Response(v4Body, { status: 200 }) : page(["ZA_0001"]);
    const without = await list(handler);
    expect(without.calls.some((c) => c.url.includes("/odata4/"))).toBe(false);
    expect(without.result.v4Status).toBe("NOT_TRIED");
    const withV4 = await list(handler, { v4: true });
    expect(withV4.result.v4Status).toBe("OK");
    expect(withV4.result.entries.map((e) => e.technicalName)).toEqual(["ZA", "ZUI_X_O4"]);
  });
});
