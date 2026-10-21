// @vitest-environment node
/**
 * POST /api/studio/interfaces/[id]/verify-service — the live check of an
 * interface's SAP service.
 *
 * The real route, the real verdict (service-verify.ts) and the real $metadata
 * fetch (connection-health.ts fetchMetadataDocument); the identity, the
 * database, the binding and the audit sink are stood in for, and SAP is a
 * stubbed global fetch. What these pin:
 *
 *   - an EDMX answer lists its datasets and — only when everything matches —
 *     is recorded on the interface, optimistically on its version, FOR THE
 *     ENVIRONMENT ASKED, with the binding that answered, beside (never over)
 *     the environments already verified;
 *   - SuccessFactors is asked about the interface's one dataset, not the
 *     whole tenant's description;
 *   - every way the answer can be wrong is named, and none is recorded;
 *   - the request is the runtime binding's: the connection's host, its client;
 *   - it is audited twice, like the lane re-check;
 *   - it takes the tight live-SAP throttle bucket.
 */

import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Resolver from "@/lib/sap-public/connection-resolver";

const { mocks, BASE } = vi.hoisted(() => ({
  BASE: "https://erp.example.internal:44300",
  mocks: {
    user: vi.fn(),
    findIface: vi.fn(),
    updateMany: vi.fn(),
    configAudit: vi.fn(),
    record: vi.fn(),
    binding: vi.fn(),
    authHeaders: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findFirst: mocks.findIface, updateMany: mocks.updateMany },
    configAudit: { create: mocks.configAudit },
  },
}));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: mocks.record }));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof Resolver>()),
  resolveSapConnectionForEnvironment: mocks.binding,
  buildAuthHeadersFromConnection: mocks.authHeaders,
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({
  resolveHubService: async () => ({ path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" }),
}));

import { POST } from "@/app/api/studio/interfaces/[id]/verify-service/route";
import { isLiveSapTenantRoute } from "@/lib/security/rate-limit";
import { VERIFY_MAX_METADATA_BYTES } from "@/lib/studio/service-verify";

const PATH = "/sap/opu/odata/sap/ZUI_X_O2";
const BUILDER = { id: "u_builder", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" };

const CONNECTION = {
  source: "db",
  id: "conn_dev",
  organizationId: "org_a",
  product: "s4hana-onprem",
  key: "dev",
  label: "ERP DEV",
  baseUrl: BASE,
  authType: "basic",
  secrets: { username: "u", password: "p" },
  oauthTokenUrl: null,
  writeEnabled: false,
  apiPath: null,
  timeoutMs: null,
  environment: "DEV",
  client: "100",
};

const V2_EDMX =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:sap="http://www.sap.com/Protocols/SAPData">' +
  '<edmx:DataServices m:DataServiceVersion="2.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">' +
  '<Schema Namespace="ZUI_X_O2"><EntityType Name="Travel"/>' +
  '<EntityContainer Name="ZUI_X_O2_Entities" m:IsDefaultEntityContainer="true">' +
  '<EntitySet Name="A_Travel" EntityType="ZUI_X_O2.Travel" sap:creatable="true"/>' +
  '<EntitySet Name="A_Booking" EntityType="ZUI_X_O2.Booking"/>' +
  "</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>";

const V4_EDMX =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">' +
  '<edmx:DataServices><Schema Namespace="com.sap.gateway.srvd_a2x.zx.v0001" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
  '<EntityContainer Name="Container"><EntitySet Name="Travel" EntityType="com.sap.gateway.srvd_a2x.zx.v0001.TravelType"/>' +
  "</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>";

function iface(overrides: Record<string, unknown> = {}) {
  return {
    id: "if_1",
    version: 4,
    sapProduct: "s4hana-onprem",
    externalId: `custom:${PATH}`,
    servicePath: PATH,
    odataVersion: "V2",
    entitySet: "A_Travel",
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
const xml = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "application/xml" } });

function verify(body: unknown = { environment: "DEV", sapClient: "100" }) {
  return POST(
    new NextRequest("http://localhost/api/studio/interfaces/if_1/verify-service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "if_1" }) },
  );
}

type Data = {
  status: string;
  verified: boolean;
  detail: string;
  entitySets: string[];
  suggestedEntitySet: string | null;
  detectedODataVersion: string | null;
  serviceSource: string;
  boundTo: { label: string; sapClient: string | null } | null;
  bindingRefusal?: string;
};
async function data(res: Response): Promise<Data> {
  return ((await res.json()) as { data: Data }).data;
}

function configAuditAfter(): Record<string, unknown> {
  return mocks.configAudit.mock.calls.at(-1)![0].data.after as Record<string, unknown>;
}

beforeEach(() => {
  mocks.user.mockResolvedValue(BUILDER);
  mocks.findIface.mockResolvedValue(iface());
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.configAudit.mockResolvedValue({ id: "a1" });
  mocks.binding.mockResolvedValue({ ok: true, connection: CONNECTION, bindingUnverified: false });
  mocks.authHeaders.mockResolvedValue({ Authorization: "Basic dTpw" });
  fetchMock = vi.fn(async () => xml(V2_EDMX));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("a service that answers", () => {
  it("V2: lists the datasets and records the verification on THIS version", async () => {
    const res = await verify();
    expect(res.status).toBe(200);
    const d = await data(res);
    expect(d).toMatchObject({
      status: "OK",
      verified: true,
      entitySets: ["A_Travel", "A_Booking"],
      detectedODataVersion: "V2",
      serviceSource: "custom",
      boundTo: { label: "ERP DEV", sapClient: "100" },
    });
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    const call = mocks.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({
      id: "if_1",
      organizationId: "org_a",
      version: 4,
      serviceVerifications: { equals: Prisma.DbNull },
    });
    expect(call.data).toMatchObject({
      serviceVerifiedEnvironment: "DEV",
      serviceVerifiedEntitySets: ["A_Travel", "A_Booking"],
    });
    expect(call.data.serviceVerifiedAt).toBeInstanceOf(Date);
    // Per binding — environment and SAP client — with the binding that
    // answered (review rounds 1 and 2).
    expect(call.data.serviceVerifications).toEqual({
      "DEV::100": {
        environment: "DEV",
        at: call.data.serviceVerifiedAt.toISOString(),
        connectionId: "conn_dev",
        sapClient: "100",
        baseUrl: BASE,
      },
    });
  });

  it("adds this environment beside the ones already verified, never over them", async () => {
    const prod = { at: "2026-10-18T09:00:00.000Z", connectionId: "conn_prd", sapClient: "300", baseUrl: "https://prd" };
    mocks.findIface.mockResolvedValue(iface({ serviceVerifications: { PROD: prod } }));
    await verify();
    const call = mocks.updateMany.mock.calls[0]![0];
    expect(call.where.serviceVerifications).toEqual({ equals: { PROD: prod } });
    expect(call.data.serviceVerifications).toEqual({
      "PROD::300": { environment: "PROD", ...prod },
      "DEV::100": expect.objectContaining({ environment: "DEV", connectionId: "conn_dev", sapClient: "100", baseUrl: BASE }),
    });
  });

  it("a second SAP client of the same environment is kept beside the first (review round 2)", async () => {
    const c100 = { environment: "PROD", at: "2026-10-18T09:00:00.000Z", connectionId: "conn-100", sapClient: "100", baseUrl: BASE };
    mocks.findIface.mockResolvedValue(iface({ serviceVerifications: { "PROD::100": c100 } }));
    mocks.binding.mockResolvedValue({
      ok: true,
      connection: { ...CONNECTION, id: "conn-200", environment: "PROD", client: "200" },
      bindingUnverified: false,
    });
    await verify({ environment: "PROD", sapClient: "200" });
    const written = mocks.updateMany.mock.calls[0]![0].data.serviceVerifications as Record<string, { connectionId: string }>;
    expect(Object.keys(written).sort()).toEqual(["PROD::100", "PROD::200"]);
    expect(written["PROD::100"]).toEqual(c100);
    expect(written["PROD::200"]!.connectionId).toBe("conn-200");
  });

  it("a verify of another environment that landed meanwhile is re-read and kept", async () => {
    const sbx = { at: "2026-10-20T01:00:00.000Z", connectionId: "conn_sbx", sapClient: null, baseUrl: "https://sbx" };
    mocks.findIface
      .mockResolvedValueOnce(iface())
      .mockResolvedValueOnce({ version: 4, serviceVerifications: { SANDBOX: sbx } });
    mocks.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    const d = await data(await verify());
    expect(d.status).toBe("OK");
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    const second = mocks.updateMany.mock.calls[1]![0];
    expect(second.where.serviceVerifications).toEqual({ equals: { SANDBOX: sbx } });
    expect(Object.keys(second.data.serviceVerifications as object).sort()).toEqual(["DEV::100", "SANDBOX::"]);
  });

  it("a contract change that landed meanwhile stops the retry", async () => {
    mocks.findIface.mockResolvedValueOnce(iface()).mockResolvedValueOnce({ version: 5, serviceVerifications: null });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const d = await data(await verify());
    expect(d.status).toBe("CHANGED_DURING_VERIFY");
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });

  it("asks the connection's host for the service's $metadata, with the client after the full path", async () => {
    await verify();
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}${PATH}/$metadata?sap-client=100`);
    expect(mocks.binding).toHaveBeenCalledWith("org_a", "s4hana-onprem", "DEV", "READ", "100");
  });

  it("V4: reads a service-group description", async () => {
    const v4 = "/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001";
    mocks.findIface.mockResolvedValue(
      iface({ servicePath: v4, externalId: `custom:${v4}`, odataVersion: "V4", entitySet: "Travel" }),
    );
    fetchMock.mockImplementation(async () => xml(V4_EDMX));
    const d = await data(await verify());
    expect(d).toMatchObject({ status: "OK", verified: true, entitySets: ["Travel"], detectedODataVersion: "V4" });
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}${v4}/$metadata?sap-client=100`);
  });

  it("verifies a catalogue interface too, informationally, on its catalogue path", async () => {
    mocks.findIface.mockResolvedValue(
      iface({ externalId: "API_BUSINESS_PARTNER", servicePath: null, odataVersion: null, entitySet: null }),
    );
    const d = await data(await verify());
    expect(d.serviceSource).toBe("catalogue");
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata?sap-client=100`);
  });
});

describe("SuccessFactors: one dataset's description, not the tenant's (review round 1)", () => {
  const SF_EDMX =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">' +
    '<edmx:DataServices m:DataServiceVersion="2.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">' +
    '<Schema Namespace="SFOData"><EntityType Name="cust_Equipment"/>' +
    '<EntityContainer Name="EntityContainer" m:IsDefaultEntityContainer="true">' +
    '<EntitySet Name="cust_Equipment" EntityType="SFOData.cust_Equipment"/>' +
    "</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>";
  const sf = (overrides: Record<string, unknown> = {}) =>
    iface({
      sapProduct: "successfactors",
      servicePath: "/odata/v2",
      externalId: "custom:/odata/v2",
      odataVersion: "V2",
      entitySet: "cust_Equipment",
      ...overrides,
    });

  beforeEach(() => {
    mocks.binding.mockResolvedValue({
      ok: true,
      connection: { ...CONNECTION, product: "successfactors", client: null },
      bindingUnverified: false,
    });
    fetchMock.mockImplementation(async () => xml(SF_EDMX));
  });

  it("asks {root}/{EntitySet}/$metadata and verifies the dataset", async () => {
    mocks.findIface.mockResolvedValue(sf());
    const d = await data(await verify({ environment: "DEV" }));
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/odata/v2/cust_Equipment/$metadata`);
    expect(d).toMatchObject({ status: "OK", verified: true, entitySets: ["cust_Equipment"] });
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });

  describe("no dataset entered: the whole tenant is asked (review round 4)", () => {
    const DATASET_NEEDED = /^Set the dataset \(for example cust_TravelRequest\) on the interface, then verify again/;

    it("too large → says to enter the dataset, not ABAP advice", async () => {
      mocks.findIface.mockResolvedValue(sf({ entitySet: null }));
      const padding = "<!--" + "x".repeat(VERIFY_MAX_METADATA_BYTES) + "-->";
      fetchMock.mockImplementation(async () => xml(SF_EDMX.replace("</Schema>", `${padding}</Schema>`)));
      const d = await data(await verify({ environment: "DEV" }));
      expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/odata/v2/$metadata`);
      expect(d.status).toBe("METADATA_TOO_LARGE");
      expect(d.detail).toMatch(DATASET_NEEDED);
      expect(d.detail).not.toContain("service binding");
    });

    it("no answer in time from the tenant → says so, and to enter the dataset", async () => {
      mocks.findIface.mockResolvedValue(sf({ entitySet: null }));
      fetchMock.mockImplementation(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      });
      const d = await data(await verify({ environment: "DEV" }));
      expect(d.status).toBe("TIMEOUT");
      expect(d.detail).toMatch(/^The tenant did not respond within \d+ms\. Set the dataset \(for example cust_TravelRequest\)/);
    });

    /**
     * A timeout of the CREDENTIAL step (the OAuth token endpoint) never
     * reached the tenant, so the size of its description is not the cause and
     * "set the dataset" is the wrong advice: the token endpoint's own sentence
     * stays (review round 5).
     */
    it("no answer in time from the token endpoint → names the token endpoint, not the dataset (review round 5)", async () => {
      mocks.findIface.mockResolvedValue(sf({ entitySet: null }));
      mocks.authHeaders.mockImplementation(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      });
      const d = await data(await verify({ environment: "DEV" }));
      expect(d.status).toBe("TIMEOUT");
      expect(d.detail).toMatch(/^The connection's token endpoint did not respond within \d+ms\.$/);
      expect(d.detail).not.toContain("Set the dataset");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a V4 SuccessFactors service asked whole keeps the ordinary answers", async () => {
      mocks.findIface.mockResolvedValue(sf({ servicePath: "/odatav4/talent/learning/Course.svc/v1", entitySet: null }));
      const padding = "<!--" + "x".repeat(VERIFY_MAX_METADATA_BYTES) + "-->";
      fetchMock.mockImplementation(async () => xml(SF_EDMX.replace("</Schema>", `${padding}</Schema>`)));
      const d = await data(await verify({ environment: "DEV" }));
      expect(d.status).toBe("METADATA_TOO_LARGE");
      expect(d.detail).not.toMatch(DATASET_NEEDED);
    });
  });

  it("a dataset SuccessFactors does not know → NOT_FOUND naming the dataset", async () => {
    mocks.findIface.mockResolvedValue(sf({ entitySet: "cust_Nope" }));
    fetchMock.mockImplementation(async () => new Response("", { status: 404 }));
    const d = await data(await verify({ environment: "DEV" }));
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/odata/v2/cust_Nope/$metadata`);
    expect(d.status).toBe("NOT_FOUND");
    expect(d.detail).toContain('no dataset called "cust_Nope"');
  });

  it("with no dataset yet, the root is asked (the only way to list them)", async () => {
    mocks.findIface.mockResolvedValue(sf({ entitySet: null }));
    await verify({ environment: "DEV" });
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/odata/v2/$metadata`);
  });

  it("a dataset that is not a simple name is never joined onto the path", async () => {
    mocks.findIface.mockResolvedValue(sf({ entitySet: "../sfapi" }));
    await verify({ environment: "DEV" });
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/odata/v2/$metadata`);
  });

  it("an OData V4 service under /odatav4/ is read whole, even with a dataset (V4 has no per-entity $metadata) (review round 3)", async () => {
    const V4_PATH = "/odatav4/talent/x/Svc.svc/v1";
    mocks.findIface.mockResolvedValue(
      sf({ servicePath: V4_PATH, externalId: `custom:${V4_PATH}`, odataVersion: "V4", entitySet: "Things" }),
    );
    await verify({ environment: "DEV" });
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}${V4_PATH}/$metadata`);
  });

  it("the /odata/v2 root is matched without regard to case", async () => {
    mocks.findIface.mockResolvedValue(sf({ servicePath: "/OData/V2", externalId: "custom:/OData/V2" }));
    await verify({ environment: "DEV" });
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/OData/V2/cust_Equipment/$metadata`);
  });

  it("S/4HANA still reads the whole service's description", async () => {
    mocks.binding.mockResolvedValue({ ok: true, connection: CONNECTION, bindingUnverified: false });
    fetchMock.mockImplementation(async () => xml(V2_EDMX));
    await verify();
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}${PATH}/$metadata?sap-client=100`);
  });
});

describe("every wrong answer is named, and none is recorded", () => {
  it("an HTML 200 (a login page) → ERROR", async () => {
    fetchMock.mockImplementation(
      async () => new Response("<html><body>Sign in</body></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const d = await data(await verify());
    expect(d.status).toBe("ERROR");
    expect(d.verified).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 502, failureReason: "INVALID_UPSTREAM_BODY" }),
    );
  });

  it("a CSDL JSON answer the compiler cannot read is answered as before the compiler, never a 500 (P1 wave A review)", async () => {
    // "<Edmx>" passes the EDMX sniff; the enum member's value is an object
    // whose toString is not a function, which String() throws on.
    mocks.findIface.mockResolvedValue(iface({ odataVersion: "V4" }));
    fetchMock.mockImplementation(
      async () =>
        new Response('{"$Version":"4.0","x":"<Edmx>","ns":{"En":{"$Kind":"EnumType","A":{"toString":1}}}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const res = await verify();
    expect(res.status).toBe(200);
    const d = await data(res);
    expect(d.verified).toBe(false);
    expect(d.status).toBe("ENTITY_SET_MISSING");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("401 → UNAUTHORIZED, audited as 401", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 401 }));
    const d = await data(await verify());
    expect(d.status).toBe("UNAUTHORIZED");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ status: 401, failureReason: "HTTP_401" }));
  });

  it("404 → NOT_FOUND, with the sentence that says where to look", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 404 }));
    const d = await data(await verify());
    expect(d.status).toBe("NOT_FOUND");
    expect(d.detail).toMatch(/no service at this path.*\/IWFND\/MAINT_SERVICE/);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it("an aborted request → TIMEOUT", async () => {
    fetchMock.mockImplementation(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const d = await data(await verify());
    expect(d.status).toBe("TIMEOUT");
    expect(d.verified).toBe(false);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ status: 504, failureReason: "TIMEOUT" }));
  });

  it("the dataset is missing → ENTITY_SET_MISSING, with a case-insensitive suggestion", async () => {
    mocks.findIface.mockResolvedValue(iface({ entitySet: "a_travel" }));
    const d = await data(await verify());
    expect(d.status).toBe("ENTITY_SET_MISSING");
    expect(d.suggestedEntitySet).toBe("A_Travel");
    expect(d.entitySets).toEqual(["A_Travel", "A_Booking"]);
    expect(d.detail).toContain('"a_travel"');
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("a dataset with no near match → no suggestion", async () => {
    mocks.findIface.mockResolvedValue(iface({ entitySet: "Flights" }));
    const d = await data(await verify());
    expect(d.status).toBe("ENTITY_SET_MISSING");
    expect(d.suggestedEntitySet).toBeNull();
  });

  it("the version differs → VERSION_MISMATCH, datasets still listed", async () => {
    mocks.findIface.mockResolvedValue(iface({ odataVersion: "V4" }));
    const d = await data(await verify());
    expect(d.status).toBe("VERSION_MISMATCH");
    expect(d.detail).toBe(
      "This service describes itself as OData V2, but the interface says V4. Change the version, then verify again.",
    );
    expect(d.entitySets).toEqual(["A_Travel", "A_Booking"]);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it(`a description over ${VERIFY_MAX_METADATA_BYTES} bytes → METADATA_TOO_LARGE`, async () => {
    const padding = "<!--" + "x".repeat(VERIFY_MAX_METADATA_BYTES) + "-->";
    fetchMock.mockImplementation(async () => xml(V2_EDMX.replace("</Schema>", `${padding}</Schema>`)));
    const d = await data(await verify());
    expect(d.status).toBe("METADATA_TOO_LARGE");
    expect(d.verified).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("a PATCH that landed mid-verify wins → CHANGED_DURING_VERIFY", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const d = await data(await verify());
    expect(d.status).toBe("CHANGED_DURING_VERIFY");
    expect(d.verified).toBe(false);
    expect(configAuditAfter()).toMatchObject({ status: "CHANGED_DURING_VERIFY", verified: false });
  });

  it("no detail sentence names the host", async () => {
    for (const status of [401, 404, 500]) {
      fetchMock.mockImplementation(async () => new Response("", { status }));
      const d = await data(await verify());
      expect(d.detail).not.toContain("erp.example.internal");
    }
  });
});

describe("a refused binding", () => {
  it("is an outcome, audited both ways, and SAP is not called", async () => {
    mocks.binding.mockResolvedValue({ ok: false, reason: "NO_MATCH_FOR_ENVIRONMENT" });
    const res = await verify({ environment: "PROD" });
    expect(res.status).toBe(200);
    const d = await data(res);
    expect(d).toMatchObject({ status: "BINDING_REFUSED", verified: false, bindingRefusal: "NO_MATCH_FOR_ENVIRONMENT" });
    expect(d.detail).toMatch(/No SAP connection is configured for the PROD environment/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ status: 403, dryRun: true, actorUserId: "u_builder" }));
    expect(configAuditAfter()).toMatchObject({ event: "service_verify", status: "BINDING_REFUSED" });
  });
});

describe("guards", () => {
  it("401s an anonymous caller", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await verify()).status).toBe(401);
  });

  it("403s a role that can view Studio but not mutate it", async () => {
    mocks.user.mockResolvedValue({ ...BUILDER, role: "platform_admin" });
    const res = await verify();
    expect(res.status).toBe(403);
    expect(mocks.findIface).not.toHaveBeenCalled();
  });

  it("404s another organization's interface — scoped by the caller's own organization", async () => {
    mocks.findIface.mockResolvedValue(null);
    const res = await verify();
    expect(res.status).toBe(404);
    expect(mocks.findIface.mock.calls[0]![0].where).toEqual({ id: "if_1", organizationId: "org_a" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400s Ariba — not an OData product", async () => {
    mocks.findIface.mockResolvedValue(iface({ sapProduct: "ariba", servicePath: null, externalId: "x" }));
    const res = await verify();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Ariba is not an OData product, so there is no service description to verify.");
  });

  it("400s a body with no environment, or a malformed client", async () => {
    expect((await verify({})).status).toBe(400);
    expect((await verify({ environment: "DEV", sapClient: "1000" })).status).toBe(400);
  });
});

describe("audit", () => {
  it("writes a console-read row: dry run, the person named, the grant id, no row count", async () => {
    await verify();
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_a",
        actorUserId: "u_builder",
        dryRun: true,
        externalId: `custom:${PATH}`,
        solutionId: null,
        clientTokenId: null,
        rowCount: null,
        status: 200,
        connectionId: "conn_dev",
        connectionEnvironment: "DEV",
      }),
    );
  });

  it("writes a TEST_CONNECT config audit, event service_verify", async () => {
    await verify();
    const call = mocks.configAudit.mock.calls.at(-1)![0];
    expect(call.data).toMatchObject({
      organizationId: "org_a",
      actorId: "u_builder",
      entityType: "Interface",
      entityId: "if_1",
      action: "TEST_CONNECT",
    });
    expect(configAuditAfter()).toMatchObject({
      event: "service_verify",
      environment: "DEV",
      sapClient: "100",
      connectionId: "conn_dev",
      serviceSource: "custom",
      status: "OK",
      verified: true,
      interfaceVersion: 4,
      entitySetCount: 2,
    });
  });
});

describe("throttle", () => {
  it("takes the tight live-SAP bucket, and only this path", () => {
    expect(isLiveSapTenantRoute("/api/studio/interfaces/if_1/verify-service")).toBe(true);
    expect(isLiveSapTenantRoute("/api/studio/interfaces")).toBe(false);
    expect(isLiveSapTenantRoute("/api/studio/interfaces/if_1")).toBe(false);
    expect(isLiveSapTenantRoute("/api/studio/interfaces/if_1/verify-service/x")).toBe(false);
    expect(isLiveSapTenantRoute("/api/studio/interfaces/a/b/verify-service")).toBe(false);
  });
});
