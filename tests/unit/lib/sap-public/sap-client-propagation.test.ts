/**
 * The SAP client survives every hop from a stored connection to the wire.
 *
 * WHY THIS FILE EXISTS. The whole `sap-client` mechanism — the column on
 * SapConnection, the `client?` field on SapTenant, `buildSapUrl` applying it
 * after the path — was live at both ends and dead in the middle: `toSapTenant`
 * projected `{ key, label, baseUrl }` and dropped `client` (and `environment`),
 * and `getConfiguredSapTenants` never parsed `client` from
 * `{PREFIX}_TENANTS_JSON`. Every read path that resolves a tenant went through
 * one of those two, so no read URL ever carried `sap-client` — on exactly the
 * products (`cloud-erp-private`, `s4hana-onprem`) whose `addressesClient: true`
 * exists for it. sap-url.ts names the resulting hazard: reading one client's
 * data thinking it is another's, with the request succeeding.
 *
 * These tests pin each hop, so a projection that goes lossy again fails by
 * name rather than by a silent wrong-container read.
 */

import { afterEach, describe, expect, it } from "vitest";

import { toSapTenant, type ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { buildSapUrl } from "@/lib/sap-public/sap-url";
import { getConfiguredSapTenants } from "@/lib/sap-public/tdd-connector";

function resolved(overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection {
  return {
    source: "db",
    id: "conn_1",
    organizationId: "org_1",
    product: "s4hana-onprem",
    key: "erp-dev",
    label: "ERP DEV",
    baseUrl: "https://erp.example.internal",
    authType: "basic",
    secrets: { username: "u", password: "p" },
    oauthTokenUrl: null,
    writeEnabled: false,
    apiPath: null,
    timeoutMs: null,
    environment: "DEV",
    client: "100",
    ...overrides,
  };
}

describe("toSapTenant carries the whole addressing identity", () => {
  it("keeps client and environment", () => {
    const tenant = toSapTenant(resolved());
    expect(tenant.client).toBe("100");
    expect(tenant.environment).toBe("DEV");
  });

  it("omits them cleanly when the product has none — null is the truth for cloud", () => {
    const tenant = toSapTenant(resolved({ client: null, environment: null }));
    expect(tenant.client).toBeUndefined();
    expect(tenant.environment).toBeUndefined();
  });

  it("the projected tenant produces a URL that names the data container", () => {
    const tenant = toSapTenant(resolved());
    const url = buildSapUrl({
      baseUrl: tenant.baseUrl,
      path: "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/$metadata",
      client: tenant.client,
    });
    expect(url).toContain("sap-client=100");
  });
});

describe("deployment tenants can declare a client", () => {
  const PREFIX = "CLIENTTEST_TDD";

  afterEach(() => {
    delete process.env[`${PREFIX}_TENANTS_JSON`];
    delete process.env[`${PREFIX}_BASE_URL`];
    delete process.env[`${PREFIX}_TENANT_CLIENT`];
    delete process.env[`${PREFIX}_TENANT_LABEL`];
  });

  it("parses client from TENANTS_JSON", () => {
    process.env[`${PREFIX}_TENANTS_JSON`] = JSON.stringify([
      { key: "dev-100", label: "DEV 100", baseUrl: "https://erp.example.internal", client: "100" },
      { key: "cloud", label: "Cloud", baseUrl: "https://x.s4hana.cloud.sap" },
    ]);
    const tenants = getConfiguredSapTenants(PREFIX);
    expect(tenants[0]?.client).toBe("100");
    // Absent stays absent — no client is invented for a cloud tenant.
    expect(tenants[1]?.client).toBeUndefined();
  });

  it("parses TENANT_CLIENT on the single-tenant shape", () => {
    process.env[`${PREFIX}_BASE_URL`] = "https://erp.example.internal";
    process.env[`${PREFIX}_TENANT_CLIENT`] = "080";
    const tenants = getConfiguredSapTenants(PREFIX);
    expect(tenants[0]?.client).toBe("080");
  });
});
