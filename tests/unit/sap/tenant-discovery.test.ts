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

import { describe, expect, it } from "vitest";

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

  it("is read back only as this build understands it", () => {
    expect(readStoredEntries([stored(1), { id: "x", class: "SOMETHING_NEW" }, null])).toEqual([stored(1)]);
    expect(readStoredEntries("not an array")).toEqual([]);
  });
});
