// @vitest-environment node
/**
 * A TWIN connection's credentials are never sent anywhere (P0.14, transport.ts).
 *
 * The twin serves a call with no network, so the credential step is part of
 * the transport: a TWIN call builds no Authorization header, exchanges no
 * OAuth or SAML token, and sends no API key — not to the customer's token
 * endpoint, and not to the engine either. Only the data request reaches the
 * engine. Checked for every auth type a connection can have, on the read and
 * on the write, with the global fetch (what the token exchanges use) watched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { callSapRead, callSapWrite, type CircuitPermit } from "@/lib/governed/pipeline";
import { registerTwinEngine, transportFor, TWIN_TRANSPORT } from "@/lib/governed/transport";
import type { ResolvedSapConnection, SapAuthType } from "@/lib/sap-public/connection-resolver";

const NO_CIRCUIT: CircuitPermit = { record: async () => undefined };

const SECRETS = {
  username: "COMM_USER",
  password: "SUPER-SECRET",
  bearerToken: "SUPER-SECRET-BEARER",
  clientId: "CID",
  clientSecret: "SUPER-SECRET",
  samlUserId: "COMM_USER",
  samlAssertion: "PHNhbWw+U1VQRVItU0VDUkVUPC9zYW1sPg==",
  companyId: "ACME",
  apiKey: "SUPER-SECRET-KEY",
};

const twin = (authType: SapAuthType): ResolvedSapConnection => ({
  source: "db",
  id: "conn_twin",
  organizationId: "org_a",
  product: "s4hana",
  key: "twin",
  label: "Twin",
  baseUrl: "https://my000001-api.s4hana.cloud.sap",
  authType,
  secrets: SECRETS,
  oauthTokenUrl: "https://my000001.authentication.eu10.hana.ondemand.com/oauth/token",
  writeEnabled: true,
  apiPath: null,
  timeoutMs: null,
  environment: "DEV",
  client: null,
  transport: "TWIN",
});

const AUTH_TYPES: readonly SapAuthType[] = ["basic", "bearer", "oauth-client-credentials", "oauth-saml-bearer", "api-key"];

const engineRequests: Request[] = [];
const globalFetch = vi.fn(async () => new Response("must not be called", { status: 599 }));

beforeEach(() => {
  engineRequests.length = 0;
  globalFetch.mockClear();
  vi.stubGlobal("fetch", globalFetch);
  registerTwinEngine({
    handle: async (request) => {
      engineRequests.push(request);
      if (request.method === "GET" && new URL(request.url).pathname.endsWith("/")) {
        return new Response("{}", { status: 200, headers: { "x-csrf-token": "twin-csrf", "content-type": "application/json" } });
      }
      if (request.method === "POST") {
        return new Response(JSON.stringify({ d: { a: 1 } }), { status: 201, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ d: { results: [{ a: 1 }] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
});
afterEach(() => {
  registerTwinEngine(null);
  vi.unstubAllGlobals();
});

function expectNoCredentialAnywhere(): void {
  expect(globalFetch).not.toHaveBeenCalled();
  expect(engineRequests.length).toBeGreaterThan(0);
  for (const request of engineRequests) {
    const headers = [...request.headers.entries()];
    expect(headers.map(([name]) => name.toLowerCase())).not.toContain("authorization");
    expect(JSON.stringify(headers)).not.toContain("SUPER-SECRET");
    expect(JSON.stringify(headers)).not.toContain("U1VQRVItU0VDUkVU");
  }
}

describe("a TWIN call sends no credential anywhere", () => {
  it.each(AUTH_TYPES)("a %s read is served by the engine, with no token exchange and no credential header", async (authType) => {
    const connection = twin(authType);
    expect(transportFor(connection)).toBe(TWIN_TRANSPORT);
    const { result } = await callSapRead(
      { connection, transport: TWIN_TRANSPORT },
      { servicePath: "/sap/opu/odata/sap/API_X", entitySet: "A_X", limit: 1 },
      NO_CIRCUIT,
    );
    expect(result.status).toBe("OK");
    expectNoCredentialAnywhere();
  });

  it.each(AUTH_TYPES)("a %s write is served by the engine, with no token exchange and no credential header", async (authType) => {
    const connection = twin(authType);
    const { result } = await callSapWrite(
      { connection, transport: TWIN_TRANSPORT },
      { servicePath: "/sap/opu/odata/sap/API_X", entitySet: "A_X", payload: { a: 1 } },
      NO_CIRCUIT,
    );
    expect(result.status).toBe("CREATED");
    expectNoCredentialAnywhere();
  });
});
