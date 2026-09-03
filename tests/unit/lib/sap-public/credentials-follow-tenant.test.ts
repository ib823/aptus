/**
 * The credentials travel with the tenant.
 *
 * THE DEFECT. `resolveReadTenant` (tenant-for-read.ts) let every `/api/sap/tdd/*`
 * read route resolve a tenant from EITHER registry — the deployment's env
 * tenants, or an organization's stored `SapConnection` — and hand it to the
 * connector. But the connector built its Authorization header from
 * `{PREFIX}_*` env vars regardless of where the tenant came from. So a stored
 * connection's baseUrl was called with the DEPLOYMENT's shared credentials: the
 * demo tenant's username and password, sent to a customer's host.
 *
 * The broker (northbound/read.ts), the connection probe (connection-health.ts)
 * and broker-run each refused to reuse the connector for exactly this reason
 * and said so in their headers. The read routes were the callers where it still
 * happened. This pins the fix: a tenant projected from a connection carries its
 * own credential provider, and the connector uses it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSource } from "../../../helpers/source";
import {
  inspectSapService,
  previewSapEntitySet,
  type SapServiceDefinition,
  type SapTenant,
} from "@/lib/sap-public/tdd-connector";
import { toSapTenant, type ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

const ROOT = resolve(__dirname, "../../../..");
const CONNECTOR = stripSource(readFileSync(resolve(ROOT, "src/lib/sap-public/tdd-connector.ts"), "utf8"), "comments");

const SERVICE: SapServiceDefinition = {
  key: "purchase-orders",
  label: "Purchase Orders",
  scenario: "SAP_COM_0053",
  path: "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV",
  domain: "Sourcing and Procurement",
};

const METADATA_XML = `<edmx:Edmx><EntitySet Name="A_PurchaseOrder" EntityType="X.A_PurchaseOrderType"/></edmx:Edmx>`;

function connection(overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection {
  return {
    source: "db",
    id: "conn_1",
    organizationId: "org_1",
    product: "s4hana",
    key: "acme-prod",
    label: "Acme PROD",
    baseUrl: "https://my999999-api.s4hana.cloud.sap",
    authType: "basic",
    secrets: { username: "ACME_COMM_USER", password: "acme-secret" },
    oauthTokenUrl: null,
    writeEnabled: false,
    apiPath: null,
    timeoutMs: null,
    environment: "PROD",
    client: null,
    ...overrides,
  };
}

function fetchRecordingHeaders(body: string, contentType: string) {
  const calls: { url: string; authorization: string | null }[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), authorization: headers.get("authorization") });
    return new Response(body, { status: 200, headers: { "content-type": contentType } });
  });
  return { calls, impl };
}

describe("toSapTenant carries a credential provider for the row's own secrets", () => {
  it("resolves to the connection's Basic header, not the deployment's", async () => {
    const tenant = toSapTenant(connection());
    expect(tenant.authorization).toBeTypeOf("function");
    const expected = `Basic ${Buffer.from("ACME_COMM_USER:acme-secret").toString("base64")}`;
    await expect(tenant.authorization!()).resolves.toBe(expected);
  });

  it("does not serialise the secret with the tenant", () => {
    // The provider is a function: JSON.stringify drops it, so a tenant that
    // reaches a response body (the catalog route maps env tenants into JSON)
    // can never carry a credential by accident.
    const json = JSON.stringify(toSapTenant(connection()));
    expect(json).not.toContain("authorization");
    expect(json).not.toContain("acme-secret");
    expect(json).not.toContain("ACME_COMM_USER");
  });
});

describe("the connector uses the tenant's credentials when it has them", () => {
  beforeEach(() => {
    // The DEPLOYMENT's shared credentials — what used to be sent everywhere.
    vi.stubEnv("S4_TDD_AUTH_TYPE", "basic");
    vi.stubEnv("S4_TDD_USERNAME", "DEMO_USER");
    vi.stubEnv("S4_TDD_PASSWORD", "demo-password");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("a stored-connection tenant is called with ITS header, at ITS host", async () => {
    const { calls, impl } = fetchRecordingHeaders(METADATA_XML, "application/xml");
    vi.stubGlobal("fetch", impl);

    const tenant = toSapTenant(connection());
    const result = await inspectSapService("S4_TDD", tenant, SERVICE);

    expect(result.entitySets.map((e) => e.name)).toEqual(["A_PurchaseOrder"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://my999999-api.s4hana.cloud.sap/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/$metadata",
    );
    expect(calls[0]!.authorization).toBe(
      `Basic ${Buffer.from("ACME_COMM_USER:acme-secret").toString("base64")}`,
    );
    // The deployment's credentials must not appear anywhere in the request.
    const demo = Buffer.from("DEMO_USER:demo-password").toString("base64");
    expect(calls[0]!.authorization).not.toContain(demo);
  });

  it("a deployment tenant still authenticates from the env prefix", async () => {
    const { calls, impl } = fetchRecordingHeaders(
      JSON.stringify({ d: { results: [{ PurchaseOrder: "4500000001" }] } }),
      "application/json",
    );
    vi.stubGlobal("fetch", impl);

    const envTenant: SapTenant = {
      key: "default",
      label: "Configured Tenant",
      baseUrl: "https://my403706-api.s4hana.cloud.sap",
    };
    const preview = await previewSapEntitySet("S4_TDD", envTenant, SERVICE, "A_PurchaseOrder", 5);

    expect(preview.rows).toEqual([{ PurchaseOrder: "4500000001" }]);
    expect(calls[0]!.authorization).toBe(
      `Basic ${Buffer.from("DEMO_USER:demo-password").toString("base64")}`,
    );
  });

  it("a stored-connection tenant needs NO env credentials at all", async () => {
    // A deployment with no S4_TDD_* secrets configured — the customer-only
    // shape. Before the fix this threw "Missing required env var: S4_TDD_USERNAME"
    // for a connection that was fully configured.
    vi.stubEnv("S4_TDD_USERNAME", "");
    vi.stubEnv("S4_TDD_PASSWORD", "");
    const { impl } = fetchRecordingHeaders(METADATA_XML, "application/xml");
    vi.stubGlobal("fetch", impl);

    await expect(inspectSapService("S4_TDD", toSapTenant(connection()), SERVICE)).resolves.toMatchObject({
      entitySets: [{ name: "A_PurchaseOrder" }],
    });
  });
});

describe("no connector request can build its header from anything but the tenant", () => {
  it("buildAuthHeader(prefix) is reached only through authHeaderFor", () => {
    /*
     * Every function that takes a tenant must ask the tenant first. Counting
     * the direct calls is the cheapest way to keep the next request path from
     * quietly reintroducing an env-only header beside a customer host.
     */
    const direct = CONNECTOR.match(/buildAuthHeader\(prefix\)/g) ?? [];
    expect(direct).toHaveLength(1);
    const inAuthHeaderFor = CONNECTOR.slice(CONNECTOR.indexOf("async function authHeaderFor("));
    expect(inAuthHeaderFor.slice(0, 300)).toContain("buildAuthHeader(prefix)");
  });

  it("every Authorization header the connector sends goes through authHeaderFor", () => {
    const headers = CONNECTOR.match(/Authorization: await [a-zA-Z]+\(/g) ?? [];
    expect(headers.length).toBeGreaterThanOrEqual(7);
    for (const h of headers) expect(h).toBe("Authorization: await authHeaderFor(");
  });
});
