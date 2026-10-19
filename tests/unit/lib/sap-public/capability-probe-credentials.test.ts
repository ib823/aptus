/**
 * The capability probe through the REAL connector: a credential that could not
 * be obtained never reads as a service outcome (audit A28).
 *
 * The trigger as reported: a deployment tenant loses S4_TDD_PASSWORD in an env
 * edit, or a stored connection's token URL is mistyped. Every service came
 * back "not activated" — 0 "no response (timeout/network)" for the first,
 * 404 "not activated (not found)" for the second, because the token
 * endpoint's "HTTP 404" was read out of the error text as the service's — and
 * no request ever reached SAP.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeService } from "@/lib/sap-public/capability-probe";
import {
  clearOAuthTokenCache,
  toSapTenant,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import { inspectSapServiceMetadata, type SapServiceDefinition } from "@/lib/sap-public/tdd-connector";
import { SapCredentialError, SapHttpError } from "@/lib/sap-public/upstream-failure";

const SERVICE: SapServiceDefinition = {
  key: "API_BUSINESS_PARTNER",
  label: "Business Partner",
  scenario: "SAP_COM_0008",
  path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER",
  domain: "Master Data",
};

const TOKEN_URL = "https://acme.authentication.eu10.hana.ondemand.com/oauth/tokn";

function connection(overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection {
  return {
    source: "db",
    id: "conn_1",
    organizationId: "org_1",
    product: "s4hana",
    key: "acme-dev",
    label: "Acme DEV",
    baseUrl: "https://my999999-api.s4hana.cloud.sap",
    authType: "oauth-client-credentials",
    secrets: { clientId: "sb-client", clientSecret: "s" },
    oauthTokenUrl: TOKEN_URL,
    writeEnabled: false,
    apiPath: null,
    timeoutMs: null,
    environment: "DEV",
    client: null,
    ...overrides,
  };
}

/** Routes the token endpoint to `token`; anything else is a request to SAP. */
function network(token: () => Response) {
  const sap: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === TOKEN_URL) return token();
      sap.push(url);
      return new Response("<edmx:Edmx/>", { status: 200, headers: { "content-type": "application/xml" } });
    }),
  );
  return sap;
}

beforeEach(() => clearOAuthTokenCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("a stored connection whose token URL 404s", () => {
  it("is 'could not authenticate', not the service's NOT_FOUND, and SAP is never called", async () => {
    const sap = network(() => new Response("Not Found", { status: 404 }));
    const r = await probeService("S4_TDD", toSapTenant(connection()), SERVICE);
    expect(r.status).toBe(0);
    expect(r.credentialError).toBe("refused");
    expect(r.error).not.toContain("hana.ondemand.com");
    expect(sap).toEqual([]);
  });

  it("the connector says the request was never sent", async () => {
    network(() => new Response("", { status: 404 }));
    await expect(inspectSapServiceMetadata("S4_TDD", toSapTenant(connection()), SERVICE)).rejects.toBeInstanceOf(
      SapCredentialError,
    );
  });
});

describe("a deployment tenant missing its password", () => {
  it("is a refusal, not 'no response (timeout/network)', and SAP is never called", async () => {
    vi.stubEnv("S4_TDD_AUTH_TYPE", "basic");
    vi.stubEnv("S4_TDD_USERNAME", "DEMO_USER");
    vi.stubEnv("S4_TDD_PASSWORD", "");
    const sap = network(() => new Response("", { status: 500 }));
    const r = await probeService(
      "S4_TDD",
      { key: "default", label: "ABeam TDD", baseUrl: "https://my999999-api.s4hana.cloud.sap" },
      SERVICE,
    );
    expect(r).toMatchObject({ status: 0, credentialError: "refused" });
    expect(sap).toEqual([]);
  });
});

describe("the tenant's own answer still carries its status", () => {
  it("SAP's 403 on $metadata is a SapHttpError of 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    const err = await inspectSapServiceMetadata(
      "S4_TDD",
      toSapTenant(connection({ authType: "basic", oauthTokenUrl: null, secrets: { username: "u", password: "p" } })),
      SERVICE,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SapHttpError);
    expect((err as SapHttpError).status).toBe(403);
  });
});
