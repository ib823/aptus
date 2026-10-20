import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectSapServiceMetadata: vi.fn(),
  probeSapEntitySet: vi.fn(),
}));

vi.mock("@/lib/sap-public/tdd-connector", () => ({
  inspectSapServiceMetadata: mocks.inspectSapServiceMetadata,
  probeSapEntitySet: mocks.probeSapEntitySet,
}));

import {
  probeService,
  probeTenantCapabilities,
  summarize,
} from "@/lib/sap-public/capability-probe";
import {
  ConnectionConfigError,
  OAuthTokenRequestError,
  SapCredentialError,
  SapHttpError,
} from "@/lib/sap-public/upstream-failure";

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

  /*
   * The tenant's answer arrives as a SapHttpError carrying its status. These
   * rejected with a plain Error("... HTTP 403") and passed because the probe
   * read the status out of the message — the coupling audit A28 removed, since
   * the credential step's messages carry "HTTP nnn" too (a token endpoint's 404
   * became the service's "not activated (not found)").
   */
  it("403 → not activated (surfaced status, not an error throw)", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(new SapHttpError("Metadata request failed: HTTP 403", 403));
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r.exposed).toBe(false);
    expect(r.status).toBe(403);
  });

  it("404 → not activated", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(new SapHttpError("Metadata request failed: HTTP 404", 404));
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

/*
 * AUDIT A28 — "could not authenticate" is not what the service answered.
 *
 * A failure of the credential step reached probeService looking like any
 * other error, and the status was read out of its text: the token endpoint's
 * "HTTP 404" became this service's NOT_FOUND, a missing {PREFIX}_PASSWORD
 * became 0 "no response (timeout/network)", on every service at once, with
 * no request sent to SAP.
 */
describe("probeService — a credential that could not be obtained", () => {
  it("a token endpoint's 404 is not the service's 404", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(
      new SapCredentialError(new OAuthTokenRequestError("OAuth token request failed for k: HTTP 404", 404)),
    );
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r.status).not.toBe(404);
    expect(r).toMatchObject({ exposed: false, status: 0, credentialError: "refused" });
    expect(r.error).toMatch(/token endpoint rejected/);
  });

  it("a missing deployment variable is a refusal, not 'no response'", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(
      new SapCredentialError(new ConnectionConfigError("Missing required env var: S4_TDD_PASSWORD")),
    );
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r).toMatchObject({ status: 0, credentialError: "refused" });
  });

  it("a token endpoint that failed is 'unavailable', still not the service's answer", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(
      new SapCredentialError(new OAuthTokenRequestError("OAuth token request failed: HTTP 503", 503)),
    );
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r).toMatchObject({ status: 0, credentialError: "unavailable" });
  });

  it("an error's TEXT no longer asserts a status", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(new Error("OAuth token request failed for k: HTTP 404"));
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r.status).toBe(0);
    expect(r.credentialError).toBeUndefined();
  });

  it("summarize keys such a row as auth and does not call it not activated", () => {
    const s = summarize("T", [
      { service: "a", label: "", scenario: "", exposed: true, status: 200 },
      { service: "b", label: "", scenario: "", exposed: false, status: 403 },
      { service: "c", label: "", scenario: "", exposed: false, status: 0, credentialError: "refused" },
      { service: "d", label: "", scenario: "", exposed: false, status: 0 },
    ]);
    expect(s.byStatus).toEqual({ "200": 1, "403": 1, auth: 1, "0": 1 });
    expect(s.notActivated).toBe(2);
  });
});

describe("probeService — the opt-in data read is countable", () => {
  /*
   * The hub-content overlay's console audit row counts the $top=1 GETs that
   * left for the tenant from `dataStatus` (audit A24). A read that threw left
   * no status at all, so it went uncounted although it was made; it now carries
   * 0, the same "attempted, never answered" the metadata status uses.
   */
  const META = {
    entitySets: [{ name: "A" }],
    entityCapabilities: [{ name: "A", readable: true, creatable: false, updatable: false, deletable: false, pageable: null }],
    flavor: "v2",
  };

  it("an answered data read carries its status", async () => {
    mocks.inspectSapServiceMetadata.mockResolvedValue(META);
    mocks.probeSapEntitySet.mockResolvedValue({ ok: true, status: 200, hasErrorBody: false });
    const r = await probeService("S4_TDD", TENANT, SVC, { dataProbe: true });
    expect(r).toMatchObject({ dataStatus: 200, dataConfirmed: true });
  });

  it("a data read that threw is still recorded as made — status 0, never confirmed", async () => {
    mocks.inspectSapServiceMetadata.mockResolvedValue(META);
    mocks.probeSapEntitySet.mockRejectedValue(new Error("socket hang up"));
    const r = await probeService("S4_TDD", TENANT, SVC, { dataProbe: true });
    expect(r).toMatchObject({ dataStatus: 0, dataConfirmed: false });
  });

  it("no data read, no data status", async () => {
    mocks.inspectSapServiceMetadata.mockResolvedValue(META);
    const r = await probeService("S4_TDD", TENANT, SVC);
    expect(r.dataStatus).toBeUndefined();
    expect(mocks.probeSapEntitySet).not.toHaveBeenCalled();
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
