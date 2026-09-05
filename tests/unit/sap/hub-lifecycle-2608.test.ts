/**
 * 2608 WS2 — Hub lifecycle fields (CCC PR-1 §4).
 *
 * Three invariants:
 *   1. The normalizers carry State / Version / ModifiedAt / SubType / package
 *      release through verbatim, and stamp a successor ONLY from the checked-in
 *      map (never inferred).
 *   2. Lifecycle fields never touch what the console's status buckets read:
 *      resolveHubStatus is a pure function of contentType, apiType, externalId
 *      and probes — so Σ byStatus for ACTIVATED / NEEDS_SETUP rows is unchanged.
 *   3. The checked-in package list and successor map are real, tracked, and
 *      reproduce the 2608 facts.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { apiLifecycleFields, normalizeRow } from "@/lib/sap-public/api-reference-import";
import { httpToRuntimeStatus, resolveHubStatus, type HubContentType } from "@/lib/sap-public/hub-content";
import { hubLifecycleFields, normalizeHubRowForType, normalizeHubState } from "@/lib/sap-public/hub-import";
import { API_SUCCESSORS, successorFor } from "@/lib/sap-public/hub-successors";

const ROOT = process.cwd();
const tracked = (rel: string) =>
  execSync(`git ls-files --error-unmatch -- "${rel}"`, { cwd: ROOT, stdio: "pipe" }).toString().trim() === rel;

describe("normalizeHubRowForType · lifecycle fields", () => {
  const harvestRow = {
    externalId: "CE_CN_VALUEADDEDTAXINVOICEEVENTS",
    title: "China Incoming VAT Invoice Events",
    status: "ACTIVE",
    hubState: "ACTIVE",
    hubVersion: "1.0.0",
    hubModifiedAt: "2026-07-15T02:34:59.025Z",
    hubSubType: null,
    catalogueRelease: "2608",
    packageTechnicalName: "SAPS4HANACloudBusinessEvents",
    illustrative: false,
  };

  it("carries hubState / hubVersion / hubModifiedAt / catalogueRelease verbatim", () => {
    const n = normalizeHubRowForType(harvestRow, "EVENT")!;
    expect(hubLifecycleFields(n)).toEqual({
      hubState: "ACTIVE",
      hubVersion: "1.0.0",
      hubModifiedAt: new Date("2026-07-15T02:34:59.025Z"),
      hubSubType: null,
      catalogueRelease: "2608",
      successorExternalId: null,
    });
    // `status` (the pre-WS2 field the console already stored) is untouched.
    expect(n.status).toBe("ACTIVE");
  });

  it("falls back to state/status for hubState and upper-cases it; null when absent", () => {
    expect(normalizeHubRowForType({ externalId: "X", state: "deprecated" }, "BADI")!.hubState).toBe("DEPRECATED");
    expect(normalizeHubRowForType({ externalId: "X", status: "Released" }, "BADI")!.hubState).toBe("RELEASED");
    expect(normalizeHubRowForType({ externalId: "X" }, "BADI")!.hubState).toBeNull();
    expect(normalizeHubState("  active ")).toBe("ACTIVE");
    expect(normalizeHubState("")).toBeNull();
    expect(normalizeHubState(undefined)).toBeNull();
  });

  it("parses OData v2 /Date(ms)/ as well as ISO timestamps", () => {
    const n = normalizeHubRowForType({ externalId: "X", modifiedAt: "/Date(1784094846654)/" }, "EVENT")!;
    expect(n.hubModifiedAt?.toISOString()).toBe(new Date(1784094846654).toISOString());
    expect(normalizeHubRowForType({ externalId: "X", modifiedAt: "not a date" }, "EVENT")!.hubModifiedAt).toBeNull();
  });

  it("curated drop rows (no lifecycle keys) normalise to nulls, not guesses", () => {
    const n = normalizeHubRowForType({ externalId: "S4HANACloudBADI", title: "BAdIs", itemCount: 1715 }, "BADI")!;
    expect(hubLifecycleFields(n)).toEqual({
      hubState: null,
      hubVersion: null,
      hubModifiedAt: null,
      hubSubType: null,
      catalogueRelease: null,
      successorExternalId: null,
    });
  });
});

describe("normalizeRow (SapApiReference) · lifecycle fields + successors", () => {
  it("keeps the raw Hub State next to the normalised status and stamps the SAP-named successor", () => {
    const n = normalizeRow({
      apiId: "API_PURCHASEORDER_PROCESS_SRV",
      apiName: "Purchase Order (A2X)",
      status: "DEPRECATED",
      apiType: "ODATA",
      product: "SAPS4HANACloud",
      hubState: "DEPRECATED",
      hubVersion: "1.0.0",
      hubModifiedAt: "2026-07-15T02:32:42.091Z",
      hubSubType: "ODATA",
      catalogueRelease: "2608",
    })!;
    expect(n.status).toBe("Deprecated"); // pre-WS2 normalisation, unchanged
    expect(apiLifecycleFields(n)).toEqual({
      hubState: "DEPRECATED",
      hubVersion: "1.0.0",
      hubModifiedAt: new Date("2026-07-15T02:32:42.091Z"),
      hubSubType: "ODATA",
      catalogueRelease: "2608",
      successorExternalId: "CE_PURCHASEORDER_0001",
    });
  });

  it("never infers a successor: an unknown deprecated API gets null", () => {
    const n = normalizeRow({ apiId: "API_SOMETHING_OLD_SRV", status: "DEPRECATED", hubState: "DEPRECATED" })!;
    expect(n.successorExternalId).toBeNull();
  });

  it("a successor declared on the row itself wins over the map", () => {
    const n = normalizeRow({
      apiId: "API_PURCHASEORDER_PROCESS_SRV",
      status: "DEPRECATED",
      successorExternalId: "EXPLICIT_FROM_EXPORT",
    })!;
    expect(n.successorExternalId).toBe("EXPLICIT_FROM_EXPORT");
  });
});

describe("successor map (sap-references/api-successors.json)", () => {
  it("is git-tracked and every entry names both sides", () => {
    expect(tracked("sap-references/api-successors.json")).toBe(true);
    const file = JSON.parse(readFileSync(join(ROOT, "sap-references/api-successors.json"), "utf8")) as {
      apis: { externalId: string; successor: string }[];
    };
    expect(file.apis.length).toBeGreaterThanOrEqual(6);
    for (const e of file.apis) {
      expect(e.externalId, JSON.stringify(e)).toMatch(/^[A-Z0-9_]+$/);
      expect(e.successor, JSON.stringify(e)).toMatch(/^[A-Z0-9_]+$/);
      expect(e.successor).not.toBe(e.externalId);
    }
    expect(API_SUCCESSORS.size).toBe(file.apis.length);
  });

  it("looks up case-insensitively and answers null for the unknown", () => {
    expect(successorFor("api_purchaseorder_process_srv")).toBe("CE_PURCHASEORDER_0001");
    expect(successorFor("API_MAINTENANCEORDER")).toBe("CE_API_MAINTENANCEORDER_0002");
    expect(successorFor("API_BUSINESS_PARTNER")).toBeNull();
    expect(successorFor(null)).toBeNull();
  });
});

describe("byStatus is independent of lifecycle fields", () => {
  const types: HubContentType[] = [
    "API",
    "EVENT",
    "CDS_VIEW",
    "BADI",
    "BO_INTERFACE",
    "INTEGRATION",
    "BUILD",
    "PROCESS_BLUEPRINT",
    "LIVEPROCESS",
    "SCENARIO",
    "VPUC",
    "ANALYTICS",
  ];

  it("resolveHubStatus gives the same bucket with hubState DEPRECATED, ACTIVE or absent", () => {
    for (const contentType of types) {
      for (const apiType of ["ODATAV2", "ODATAV4", "SOAP", null]) {
        for (const probes of [undefined, new Map([["X", 200]]), new Map([["X", 403]]), new Map([["X", 404]])]) {
          const base = { externalId: "X", contentType, apiType };
          const plain = resolveHubStatus(base, probes);
          for (const extra of [
            { hubState: "DEPRECATED" },
            { hubState: "ACTIVE" },
            { hubState: null, catalogueRelease: "2608" },
          ]) {
            expect(resolveHubStatus({ ...base, ...extra } as typeof base, probes), `${contentType}/${apiType}`).toBe(
              plain,
            );
          }
        }
      }
    }
  });

  it("a probed 200 stays ACTIVATED and a 403 stays NEEDS_SETUP for a DEPRECATED API", () => {
    const item = {
      externalId: "API_PURCHASEORDER_PROCESS_SRV",
      contentType: "API" as HubContentType,
      apiType: "ODATAV2",
      hubState: "DEPRECATED",
    };
    expect(resolveHubStatus(item, new Map([[item.externalId, 200]]))).toBe("ACTIVATED");
    expect(resolveHubStatus(item, new Map([[item.externalId, 403]]))).toBe("NEEDS_SETUP");
    expect(httpToRuntimeStatus(200)).toBe("ACTIVATED");
  });

  it("hubLifecycleFields never emits status or apiType (the fields the buckets read)", () => {
    const n = normalizeHubRowForType({ externalId: "X", hubState: "DEPRECATED", apiType: "ODATAV4" }, "API")!;
    expect(Object.keys(hubLifecycleFields(n)).sort()).toEqual([
      "catalogueRelease",
      "hubModifiedAt",
      "hubState",
      "hubSubType",
      "hubVersion",
      "successorExternalId",
    ]);
  });
});

describe("package list (sap-references/hub-packages.s4public.json)", () => {
  const list = JSON.parse(readFileSync(join(ROOT, "sap-references/hub-packages.s4public.json"), "utf8")) as {
    _provenance: { product: string; completeness: string; packagesSelected: number; harvestedAt: string };
    byCategory: Record<
      string,
      { packages: number; artifacts: number; byType: Record<string, number>; byState: Record<string, number> }
    >;
    packages: {
      technicalName: string;
      version: string | null;
      category: string | null;
      artifacts: number;
      byState: Record<string, number>;
    }[];
  };

  it("is git-tracked, product-scoped, and declares itself a floor", () => {
    expect(tracked("sap-references/hub-packages.s4public.json")).toBe(true);
    expect(list._provenance.product).toBe("SAPS4HANACloud");
    expect(list._provenance.completeness).toBe("floor");
    expect(list.packages).toHaveLength(list._provenance.packagesSelected);
    expect(new Set(list.packages.map((p) => p.technicalName)).size).toBe(list.packages.length);
  });

  it("reproduces the 2608 facts: 859 APIs (803/56), 147 events (139/8), 9,288 CDS, 1,715 BAdIs, 221 BO interfaces", () => {
    const main = list.packages.find((p) => p.technicalName === "SAPS4HANACloud")!;
    expect(main.version).toBe("2608");
    expect(main.artifacts).toBe(859);
    expect(main.byState).toEqual({ ACTIVE: 803, DEPRECATED: 56 });
    const events = list.packages.find((p) => p.technicalName === "SAPS4HANACloudBusinessEvents")!;
    expect(events.artifacts).toBe(147);
    expect(events.byState).toEqual({ ACTIVE: 139, DEPRECATED: 8 });
    expect(list.byCategory.CDSViews!.artifacts).toBe(9288);
    expect(list.byCategory.SteamPunk!.byType.BADI).toBe(1715);
    expect(list.byCategory.SteamPunk!.byType.BOInterface).toBe(221);
    expect(list.byCategory.Scenarios!.packages).toBe(16);
    expect(list.byCategory.Analytics!.packages).toBe(6);
  });
});
