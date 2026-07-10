import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapApiReference: { findMany: mocks.findMany } },
}));

import { getDynamicOdataServices, mergeProbeTargets } from "@/lib/sap-public/dynamic-catalog";

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    apiId: "API_SUPPLIERINVOICE_PROCESS_SRV",
    apiName: "Supplier Invoice",
    apiType: "ODATAV2",
    category: "Accounts Payable",
    communicationScenarios: ["SAP_COM_0057"],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe("getDynamicOdataServices", () => {
  it("maps a V2 row to the stable /sap/opu/odata/sap/<apiId> path", async () => {
    mocks.findMany.mockResolvedValue([row()]);
    const services = await getDynamicOdataServices({ edition: "PUBLIC" });
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({
      key: "api_supplierinvoice_process_srv",
      label: "Supplier Invoice",
      scenario: "SAP_COM_0057",
      path: "/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV",
      domain: "Accounts Payable",
    });
  });

  it("filters on the edition field matching the requested edition", async () => {
    await getDynamicOdataServices({ edition: "PRIVATE" });
    const where = mocks.findMany.mock.calls[0]![0].where;
    expect(where.appliesToPrivate).toBe(true);
    expect(where.appliesToPublic).toBeUndefined();
  });

  it("defaults to PUBLIC when no edition is given", async () => {
    await getDynamicOdataServices();
    expect(mocks.findMany.mock.calls[0]![0].where.appliesToPublic).toBe(true);
  });

  it("excludes V4 by default (queries only ODATAV2)", async () => {
    await getDynamicOdataServices({ edition: "PUBLIC" });
    expect(mocks.findMany.mock.calls[0]![0].where.apiType).toEqual({ in: ["ODATAV2"] });
  });

  it("opts into V4 only when includeV4 is set, and derives a best-effort V4 path", async () => {
    mocks.findMany.mockResolvedValue([
      row({ apiId: "API_BILL_OF_MATERIAL_SRV", apiType: "ODATAV4", communicationScenarios: [] }),
    ]);
    const services = await getDynamicOdataServices({ edition: "PUBLIC", includeV4: true });
    expect(mocks.findMany.mock.calls[0]![0].where.apiType).toEqual({ in: ["ODATAV2", "ODATAV4"] });
    expect(services[0]!.path).toContain("/sap/opu/odata4/sap/");
    expect(services[0]!.scenario).toBe(""); // no scenario → empty string, not undefined
  });

  it("drops rows whose apiType is not OData-probeable (e.g. SOAP)", async () => {
    // includeV4 off → a V4 row returned by a loose mock must still map to null path and be skipped
    mocks.findMany.mockResolvedValue([row({ apiType: "ODATAV4" })]);
    const services = await getDynamicOdataServices({ edition: "PUBLIC", includeV4: false });
    expect(services).toHaveLength(0);
  });
});

describe("mergeProbeTargets", () => {
  const svc = (key: string, path: string) => ({ key, label: key, scenario: "", path, domain: "" });

  it("puts curated services first, then dynamic ones", () => {
    const curated = [svc("po", "/a"), svc("inv", "/b")];
    const dynamic = [svc("x", "/c"), svc("y", "/d")];
    const merged = mergeProbeTargets(curated, dynamic, 60);
    expect(merged.map((s) => s.path)).toEqual(["/a", "/b", "/c", "/d"]);
  });

  it("dedupes by OData path (curated wins over a dynamic duplicate)", () => {
    const curated = [svc("po", "/a")];
    const dynamic = [svc("po-dup", "/a"), svc("y", "/d")];
    const merged = mergeProbeTargets(curated, dynamic, 60);
    expect(merged.map((s) => s.key)).toEqual(["po", "y"]); // "/a" kept once, curated key
  });

  it("caps at the limit but always keeps curated (they are first)", () => {
    const curated = [svc("po", "/a"), svc("inv", "/b")];
    const dynamic = Array.from({ length: 100 }, (_, i) => svc(`d${i}`, `/d${i}`));
    const merged = mergeProbeTargets(curated, dynamic, 3);
    expect(merged).toHaveLength(3);
    expect(merged.slice(0, 2).map((s) => s.path)).toEqual(["/a", "/b"]);
  });
});
