// @vitest-environment node
/**
 * The write-test's DELETE goes to the tenant, whatever SAP's Location says.
 *
 * deleteSapEntityByLocation attaches the tenant's credentials to the URL it
 * builds from the create's Location header. An absolute Location used to be
 * taken verbatim — the one URL in the product the origin guard in sap-url.ts
 * did not see. Behind a web dispatcher or reverse proxy that does not rewrite
 * Location, the create answers `http://internal-host:8000/...`, and the DELETE
 * carried the deployment's Basic credentials, in clear text, to that host.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SapUrlOriginError } from "@/lib/sap-public/sap-url";
import {
  deleteSapEntityByLocation,
  type SapServiceDefinition,
  type SapTenant,
} from "@/lib/sap-public/tdd-connector";

const BASE = "https://my403706-api.s4hana.cloud.sap";
const PATH = "/sap/opu/odata/sap/API_BUSINESS_PARTNER";
const SERVICE = {
  key: "bp",
  label: "Business Partner",
  scenario: "SAP_COM_0008",
  path: PATH,
  domain: "master-data",
} as SapServiceDefinition;

let fetchMock: ReturnType<typeof vi.fn>;
let authHeaders: ReturnType<typeof vi.fn>;

function tenant(overrides: Partial<SapTenant> = {}): SapTenant {
  return { key: "t", label: "T", baseUrl: BASE, authHeaders, ...overrides } as SapTenant;
}

beforeEach(() => {
  authHeaders = vi.fn(async () => ({ Authorization: "Basic c2VjcmV0" }));
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "DELETE"
      ? new Response(null, { status: 204 })
      : new Response("", { status: 200, headers: { "x-csrf-token": "tok" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const deleteUrl = () =>
  (fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "DELETE") ?? [])[0];

describe("an absolute Location on another origin", () => {
  it.each([
    ["an internal backend over http", "http://internal-host:8000/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner('1')"],
    ["the tenant's own host over http", `http://my403706-api.s4hana.cloud.sap${PATH}/A_BusinessPartner('1')`],
    ["another host over https", `https://attacker.example${PATH}/A_BusinessPartner('1')`],
    ["another port", `${BASE}:8443${PATH}/A_BusinessPartner('1')`],
    ["a network-path reference", `//attacker.example${PATH}/A_BusinessPartner('1')`],
  ])("is refused before anything is sent: %s", async (_label, location) => {
    await expect(deleteSapEntityByLocation("S4_TDD", tenant(), SERVICE, location)).rejects.toBeInstanceOf(
      SapUrlOriginError,
    );
    // Not the DELETE, and not the CSRF fetch either: no credential travelled.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(authHeaders).not.toHaveBeenCalled();
  });
});

describe("an absolute Location on the tenant's origin", () => {
  it("is deleted on the tenant, keeping the client SAP addressed", async () => {
    await deleteSapEntityByLocation(
      "S4_TDD",
      tenant({ client: "100" }),
      SERVICE,
      `${BASE}:443${PATH}/A_BusinessPartner('1')?sap-client=080`,
    );
    // The explicit default port is the same origin. The client in the Location
    // is SAP's own addressing of what it just wrote, and is not doubled.
    expect(deleteUrl()).toBe(`${BASE}${PATH}/A_BusinessPartner('1')?sap-client=080`);
  });

  it("adds the tenant's client when the Location carries none", async () => {
    await deleteSapEntityByLocation("S4_TDD", tenant({ client: "100" }), SERVICE, `${BASE}${PATH}/A_BusinessPartner('1')`);
    expect(deleteUrl()).toBe(`${BASE}${PATH}/A_BusinessPartner('1')?sap-client=100`);
  });

  it("does not double a path prefix the base URL carries", async () => {
    const prefixed = `${BASE}/gw`;
    await deleteSapEntityByLocation("S4_TDD", tenant({ baseUrl: prefixed }), SERVICE, `${prefixed}${PATH}/A_BusinessPartner('1')`);
    expect(deleteUrl()).toBe(`${BASE}/gw${PATH}/A_BusinessPartner('1')`);
  });
});

describe("a relative Location", () => {
  it("is built on the base URL as before", async () => {
    await deleteSapEntityByLocation("S4_TDD", tenant(), SERVICE, `${PATH}/A_BusinessPartner('1')`);
    expect(deleteUrl()).toBe(`${BASE}${PATH}/A_BusinessPartner('1')`);
  });
});
