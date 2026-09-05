/**
 * 2608 WS4 (CCC PR-3) — the Purchase Orders connector moves to OData V4.
 *
 *  1. The curated PO service is CE_PURCHASEORDER_0001 (V4, SAP_COM_0053) by
 *     default; API_PURCHASEORDER_PROCESS_SRV (V2, deprecated by SAP) stays
 *     reachable for ONE release behind {PREFIX}_PO_ODATA_V2=true, and the flag
 *     flips the dashboard card's entity set with it.
 *  2. discover / probe / preview / write parity: the same connector calls
 *     produce the same shapes for V2 and V4 responses (rows without
 *     __metadata / @odata.* noise, same fields, same nextLink handling), and
 *     the write path stays fail-closed with nothing configured.
 *  3. The Hub side knows the VERIFIED V4 binding, so a catalogue row for
 *     CE_PURCHASEORDER_0001 probes the real path, not the derived guess.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PO_SERVICE_V2_LEGACY,
  PO_SERVICE_V4,
  createSapEntitySetRecord,
  deriveReadWrite,
  getSapOperations,
  getSapProduct,
  getSapService,
  getSapServices,
  getSapTddWriteSecret,
  inspectSapServiceMetadata,
  isLegacyPoV2Enabled,
  isSapTddWriteEnabled,
  previewSapEntitySet,
  probeSapEntitySet,
  type SapTenant,
} from "@/lib/sap-public/tdd-connector";
import { KNOWN_V4_SERVICE_PATHS, deriveV4Path, hubApiToService, serviceApiId } from "@/lib/sap-public/hub-content";
import { probeService } from "@/lib/sap-public/capability-probe";

const V4_PATH = "/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001";
const V2_PATH = "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV";
const s4 = () => getSapProduct("s4hana")!;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PO service definition — V4 by default, V2 behind the flag", () => {
  it("the curated PO service is CE_PURCHASEORDER_0001 on OData V4 under SAP_COM_0053", () => {
    const svc = getSapService(s4(), "purchase-orders")!;
    expect(svc).toBe(PO_SERVICE_V4);
    expect(svc).toMatchObject({
      path: V4_PATH,
      protocol: "ODATAV4",
      hubApiId: "CE_PURCHASEORDER_0001",
      scenario: "SAP_COM_0053",
    });
    expect(svc.lifecycle?.state).toBe("ACTIVE");
    // First in the list — connection-health probes it for connections without an apiPath.
    expect(getSapServices(s4())[0]).toBe(PO_SERVICE_V4);
    // The dashboard card addresses the V4 entity set.
    expect(getSapOperations(s4()).find((o) => o.key === "purchaseOrders")?.entitySet).toBe("PurchaseOrder");
  });

  it('the flag is off unless the literal string "true"', () => {
    expect(isLegacyPoV2Enabled("S4_TDD")).toBe(false);
    for (const v of ["1", "TRUE", "yes", "on"]) {
      vi.stubEnv("S4_TDD_PO_ODATA_V2", v);
      expect(isLegacyPoV2Enabled("S4_TDD"), v).toBe(false);
    }
    vi.stubEnv("S4_TDD_PO_ODATA_V2", "true");
    expect(isLegacyPoV2Enabled("S4_TDD")).toBe(true);
  });

  it("{PREFIX}_PO_ODATA_V2=true swaps ONLY the PO service (and its card entity set) back to the deprecated V2", () => {
    vi.stubEnv("S4_TDD_PO_ODATA_V2", "true");
    const services = getSapServices(s4());
    expect(services[0]).toBe(PO_SERVICE_V2_LEGACY);
    expect(services.slice(1)).toEqual(s4().services.slice(1)); // supplier invoices, contracts, projects, attachments untouched
    const po = getSapService(s4(), "purchase-orders")!;
    expect(po).toMatchObject({ path: V2_PATH, protocol: "ODATAV2", hubApiId: "API_PURCHASEORDER_PROCESS_SRV" });
    expect(po.lifecycle).toMatchObject({ state: "DEPRECATED", successor: "CE_PURCHASEORDER_0001" });
    const ops = getSapOperations(s4());
    expect(ops.find((o) => o.key === "purchaseOrders")?.entitySet).toBe("A_PurchaseOrder");
    expect(ops.find((o) => o.key === "supplierInvoices")?.entitySet).toBe("A_SupplierInvoice");
    // The static registry itself is never mutated.
    expect(s4().services[0]).toBe(PO_SERVICE_V4);
    expect(s4().operations.find((o) => o.key === "purchaseOrders")?.entitySet).toBe("PurchaseOrder");
  });

  it("the flag is per env prefix — S4_TDD's flag does not flip the private-cloud product", () => {
    vi.stubEnv("S4_TDD_PO_ODATA_V2", "true");
    const priv = getSapProduct("cloud-erp-private")!;
    expect(getSapService(priv, "purchase-orders")).toBe(PO_SERVICE_V4);
    vi.stubEnv("S4_PRIVATE_TDD_PO_ODATA_V2", "true");
    expect(getSapService(priv, "purchase-orders")).toBe(PO_SERVICE_V2_LEGACY);
  });

  it("serviceApiId names the Hub apiId — never the V4 path's version segment", () => {
    expect(serviceApiId(PO_SERVICE_V4)).toBe("CE_PURCHASEORDER_0001");
    expect(serviceApiId(PO_SERVICE_V2_LEGACY)).toBe("API_PURCHASEORDER_PROCESS_SRV");
    expect(serviceApiId({ path: "/sap/opu/odata/sap/API_CV_ATTACHMENT_SRV" })).toBe("API_CV_ATTACHMENT_SRV");
    expect(serviceApiId({ path: V4_PATH })).toBe("0001"); // what a bare path would give — hence hubApiId
  });

  it("the attachments service carries the 2608 authorisation note", () => {
    const att = getSapService(s4(), "attachments")!;
    expect(att.authorisationNote).toMatch(/2608/);
    expect(att.authorisationNote).toMatch(/API_CV_ATTACHMENT_SRV/);
  });
});

describe("Hub side — verified V4 binding beats the derived guess", () => {
  const base = {
    contentType: "API" as const,
    title: "Purchase Order",
    packageId: "SAPS4HANACloud",
    communicationScenarios: ["SAP_COM_0053"],
  };

  it("CE_PURCHASEORDER_0001 resolves to the verified path with protocol + hubApiId", () => {
    const svc = hubApiToService({ ...base, apiType: "ODATAV4", externalId: "CE_PURCHASEORDER_0001" })!;
    expect(svc.path).toBe(V4_PATH);
    expect(svc.path).toBe(KNOWN_V4_SERVICE_PATHS.CE_PURCHASEORDER_0001);
    expect(svc).toMatchObject({ key: "CE_PURCHASEORDER_0001", protocol: "ODATAV4", hubApiId: "CE_PURCHASEORDER_0001" });
    // Same path as the curated definition → mergeProbeTargets dedupes them.
    expect(svc.path).toBe(PO_SERVICE_V4.path);
  });

  it("an unknown V4 id still gets the best-effort derived candidate; V2 stays exact", () => {
    const v4 = hubApiToService({ ...base, apiType: "ODATAV4", externalId: "CE_SOMETHING_0001" })!;
    expect(v4.path).toBe(deriveV4Path("CE_SOMETHING_0001"));
    expect(v4.path).not.toBe(V4_PATH);
    const v2 = hubApiToService({ ...base, apiType: "ODATAV2", externalId: "API_PURCHASEORDER_PROCESS_SRV" })!;
    expect(v2).toMatchObject({ path: V2_PATH, protocol: "ODATAV2", hubApiId: "API_PURCHASEORDER_PROCESS_SRV" });
  });
});

// ── discover / probe / preview / write parity against recorded shapes ───────

const V2_METADATA = `<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:sap="http://www.sap.com/Protocols/SAPData">
  <EntitySet Name="A_PurchaseOrder" EntityType="API_PURCHASEORDER_PROCESS_SRV.A_PurchaseOrderType" sap:creatable="true" sap:updatable="true" sap:deletable="true" sap:pageable="true"/>
  <EntitySet Name="A_PurchaseOrderItem" EntityType="API_PURCHASEORDER_PROCESS_SRV.A_PurchaseOrderItemType" sap:creatable="true"/>
</edmx:Edmx>`;
const V4_METADATA = `<?xml version="1.0"?><edmx:Edmx Version="4.0">
  <EntitySet Name="PurchaseOrder" EntityType="com.sap.gateway.srvd_a2x.api_purchaseorder_2.v0001.PurchaseOrderType"/>
  <EntitySet Name="PurchaseOrderItem" EntityType="com.sap.gateway.srvd_a2x.api_purchaseorder_2.v0001.PurchaseOrderItemType"/>
  <Annotations Target="com.sap.gateway.srvd_a2x.api_purchaseorder_2.v0001.Container/PurchaseOrder">
    <Annotation Term="Org.OData.Capabilities.V1.InsertRestrictions"><Record><PropertyValue Property="Insertable" Bool="true"/></Record></Annotation>
    <Annotation Term="Org.OData.Capabilities.V1.UpdateRestrictions"><Record><PropertyValue Property="Updatable" Bool="true"/></Record></Annotation>
    <Annotation Term="Org.OData.Capabilities.V1.DeleteRestrictions"><Record><PropertyValue Property="Deletable" Bool="true"/></Record></Annotation>
  </Annotations>
</edmx:Edmx>`;
const PO_ROW = {
  PurchaseOrder: "4500000123",
  PurchaseOrderType: "NB",
  Supplier: "0010000001",
  CompanyCode: "1710",
  DocumentCurrency: "USD",
};
const V2_ROWS = JSON.stringify({
  d: {
    results: [{ __metadata: { id: "x", type: "PO" }, ...PO_ROW }],
    __next: "https://t/A_PurchaseOrder?$skiptoken=1",
  },
});
const V4_ROWS = JSON.stringify({
  "@odata.context": "$metadata#PurchaseOrder",
  "@odata.metadataEtag": 'W/"m"',
  value: [{ "@odata.etag": 'W/"1"', ...PO_ROW }],
  "@odata.nextLink": "PurchaseOrder?$skiptoken=1",
});

const TENANT: SapTenant = { key: "default", label: "ABeam TDD", baseUrl: "https://my999999-api.s4hana.cloud.sap" };

interface Call {
  method: string;
  url: string;
  headers: Headers;
  body: string | null;
}

function stubSapFetch() {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url, headers, body: typeof init?.body === "string" ? init.body : null });
    const isV4 = url.includes("/sap/opu/odata4/");
    if (url.endsWith("/$metadata"))
      return new Response(isV4 ? V4_METADATA : V2_METADATA, {
        status: 200,
        headers: { "content-type": "application/xml" },
      });
    if (headers.get("x-csrf-token") === "Fetch")
      return new Response("", {
        status: 200,
        headers: { "x-csrf-token": "tok-123", "set-cookie": "SAP_SESSIONID=abc; Path=/" },
      });
    if (method === "POST") {
      const created = isV4 ? `${url}('4500000999')` : `${url}('4500000999')`;
      return new Response(JSON.stringify(isV4 ? { "@odata.context": "c", ...PO_ROW } : { d: PO_ROW }), {
        status: 201,
        headers: { "content-type": "application/json", location: created },
      });
    }
    return new Response(isV4 ? V4_ROWS : V2_ROWS, { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", impl);
  return calls;
}

describe("V2 ↔ V4 parity through the same connector calls", () => {
  beforeEach(() => {
    vi.stubEnv("S4_TDD_AUTH_TYPE", "basic");
    vi.stubEnv("S4_TDD_USERNAME", "COMM_USER");
    vi.stubEnv("S4_TDD_PASSWORD", "secret");
  });

  it("discover: both $metadata reads land on the right URL and yield readable+writable, with the honest flavor each", async () => {
    const calls = stubSapFetch();
    const v2 = await inspectSapServiceMetadata("S4_TDD", TENANT, PO_SERVICE_V2_LEGACY);
    const v4 = await inspectSapServiceMetadata("S4_TDD", TENANT, PO_SERVICE_V4);
    expect(calls.map((c) => c.url)).toEqual([
      `${TENANT.baseUrl}${V2_PATH}/$metadata`,
      `${TENANT.baseUrl}${V4_PATH}/$metadata`,
    ]);
    expect(v2.entitySets.map((e) => e.name)).toEqual(["A_PurchaseOrder", "A_PurchaseOrderItem"]);
    expect(v4.entitySets.map((e) => e.name)).toEqual(["PurchaseOrder", "PurchaseOrderItem"]);
    expect(v2.flavor).toBe("v2");
    expect(v4.flavor).toBe("v4-best-effort");
    expect(deriveReadWrite(v2.entityCapabilities)).toEqual({ read: true, write: true });
    expect(deriveReadWrite(v4.entityCapabilities)).toEqual({ read: true, write: true });
    // V4 best-effort: the un-annotated item set stays null, never inferred writable.
    expect(v4.entityCapabilities.find((c) => c.name === "PurchaseOrderItem")).toMatchObject({
      creatable: null,
      updatable: null,
      deletable: null,
    });
  });

  it("probe: $top=1 on each root entity set — same status, same count, same business keys (no @odata.* / __metadata)", async () => {
    const calls = stubSapFetch();
    const v2 = await probeSapEntitySet("S4_TDD", TENANT, PO_SERVICE_V2_LEGACY, "A_PurchaseOrder");
    const v4 = await probeSapEntitySet("S4_TDD", TENANT, PO_SERVICE_V4, "PurchaseOrder");
    expect(calls[0]!.url).toBe(`${TENANT.baseUrl}${V2_PATH}/A_PurchaseOrder?$top=1&$format=json`);
    expect(calls[1]!.url).toBe(`${TENANT.baseUrl}${V4_PATH}/PurchaseOrder?$top=1&$format=json`);
    expect([v2.ok, v2.status, v2.resultCount]).toEqual([true, 200, 1]);
    expect([v4.ok, v4.status, v4.resultCount]).toEqual([true, 200, 1]);
    expect(v4.firstResultKeys).toEqual(v2.firstResultKeys);
    expect(v4.firstResultKeys).toEqual(Object.keys(PO_ROW));
  });

  it("preview: identical rows and fields, nextLink honoured from __next and @odata.nextLink alike", async () => {
    stubSapFetch();
    const v2 = await previewSapEntitySet("S4_TDD", TENANT, PO_SERVICE_V2_LEGACY, "A_PurchaseOrder", 5);
    const v4 = await previewSapEntitySet("S4_TDD", TENANT, PO_SERVICE_V4, "PurchaseOrder", 5);
    expect(v2.rows).toEqual([PO_ROW]);
    expect(v4.rows).toEqual([PO_ROW]);
    expect(v4.fields).toEqual(v2.fields);
    expect(v4.fields).toEqual(Object.keys(PO_ROW));
    expect(typeof v2.nextLink).toBe("string");
    expect(typeof v4.nextLink).toBe("string");
  });

  it("write: the same CSRF-then-POST sequence against the V4 service root and entity set", async () => {
    const calls = stubSapFetch();
    const res = await createSapEntitySetRecord("S4_TDD", TENANT, PO_SERVICE_V4, "PurchaseOrder", { ...PO_ROW });
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", `${TENANT.baseUrl}${V4_PATH}/`],
      ["POST", `${TENANT.baseUrl}${V4_PATH}/PurchaseOrder`],
    ]);
    expect(calls[0]!.headers.get("x-csrf-token")).toBe("Fetch");
    expect(calls[1]!.headers.get("x-csrf-token")).toBe("tok-123");
    expect(calls[1]!.headers.get("cookie")).toContain("SAP_SESSIONID=abc");
    expect(JSON.parse(calls[1]!.body!)).toEqual(PO_ROW);
    expect(res).toMatchObject({ ok: true, status: 201, entitySet: "PurchaseOrder" });
    expect(res.location).toContain("PurchaseOrder('4500000999')");
  });

  it("write stays fail-closed: nothing configured → write-back disabled and no secret", () => {
    // Real functions, real (empty) env — the migration adds no new write surface.
    expect(isSapTddWriteEnabled("S4_TDD")).toBe(false);
    expect(getSapTddWriteSecret("S4_TDD")).toBeUndefined();
  });

  it("the capability probe carries protocol (V4) and the 2608 authorisation note (attachments) on its rows", async () => {
    stubSapFetch();
    const po = await probeService("S4_TDD", TENANT, PO_SERVICE_V4);
    expect(po).toMatchObject({
      service: "purchase-orders",
      exposed: true,
      protocol: "ODATAV4",
      metadataFlavor: "v4-best-effort",
    });
    expect(po.note).toBeUndefined();
    const att = await probeService("S4_TDD", TENANT, getSapService(s4(), "attachments")!);
    expect(att.note).toMatch(/2608/);
    expect(att.protocol).toBe("ODATAV2");
  });
});
