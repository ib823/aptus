import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectSapServiceMetadata: vi.fn(),
}));

vi.mock("@/lib/sap-public/tdd-connector", () => ({
  inspectSapServiceMetadata: mocks.inspectSapServiceMetadata,
}));

import {
  probeService,
  probeTenantCapabilities,
  summarize,
} from "@/lib/sap-public/capability-probe";

const TENANT = { key: "default", label: "ABeam TDD", baseUrl: "https://x.example" };
const SVC = {
  key: "api_supplierinvoice_process_srv",
  label: "Supplier Invoice",
  scenario: "SAP_COM_0057",
  path: "/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV",
  domain: "AP",
};

beforeEach(() => vi.clearAllMocks());

describe("probeService", () => {
  it("200 with metadata → exposed, with entity-set count", async () => {
    mocks.inspectSapServiceMetadata.mockResolvedValue({
      entitySets: [{ name: "A" }, { name: "B" }],
      entityCapabilities: [{ name: "A", readable: true, creatable: true, updatable: true, deletable: false, pageable: true }],
      flavor: "v2",
    });
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r).toMatchObject({ exposed: true, status: 200, entitySetCount: 2, scenario: "SAP_COM_0057", ladder: "writable", metadataFlavor: "v2" });
  });

  it("403 → not activated (surfaced status, not an error throw)", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(new Error("Metadata request failed: HTTP 403"));
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r.exposed).toBe(false);
    expect(r.status).toBe(403);
  });

  it("404 → not activated", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(new Error("Metadata request failed: HTTP 404"));
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r).toMatchObject({ exposed: false, status: 404 });
  });

  it("a non-HTTP error (timeout) → status 0, never throws", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(new Error("SAP request timed out after 30000ms"));
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r.exposed).toBe(false);
    expect(r.status).toBe(0);
    expect(r.error).toContain("timed out");
  });

  it("a non-Error rejection → status 0 with a fallback message", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue("boom");
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r.status).toBe(0);
    expect(r.error).toBe("probe failed");
  });
});

describe("probeTenantCapabilities", () => {
  it("probes every service and preserves order", async () => {
    mocks.inspectSapServiceMetadata.mockResolvedValue({ entitySets: [], entityCapabilities: [], flavor: "v2" });
    const services = Array.from({ length: 5 }, (_, i) => ({ ...SVC, key: `svc-${i}` }));
    const rows = await probeTenantCapabilities("S4_TDD", TENANT, services, 2);
    expect(rows.map((r) => r.service)).toEqual(["svc-0", "svc-1", "svc-2", "svc-3", "svc-4"]);
    expect(mocks.inspectSapServiceMetadata).toHaveBeenCalledTimes(5);
  });
});

describe("summarize", () => {
  it("counts exposed vs not-activated", () => {
    const s = summarize("ABeam TDD", [
      { service: "a", label: "", scenario: "", exposed: true, status: 200 },
      { service: "b", label: "", scenario: "", exposed: false, status: 403 },
      { service: "c", label: "", scenario: "", exposed: false, status: 404 },
    ]);
    expect(s).toMatchObject({ tenant: "ABeam TDD", published: 3, exposed: 1, notActivated: 2 });
    expect(s.rows).toHaveLength(3);
  });

  it("tallies rows per HTTP status", () => {
    const s = summarize("T", [
      { service: "a", label: "", scenario: "", exposed: true, status: 200 },
      { service: "b", label: "", scenario: "", exposed: false, status: 403 },
      { service: "c", label: "", scenario: "", exposed: false, status: 403 },
      { service: "d", label: "", scenario: "", exposed: false, status: 401 },
    ]);
    expect(s.byStatus).toEqual({ "200": 1, "403": 2, "401": 1 });
  });
});
