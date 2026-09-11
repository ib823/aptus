/**
 * AD-12 shipped `apiKeyHeader` validated as "letters, digits and hyphens".
 *
 * `Authorization`, `Cookie` and `Host` all satisfy that. A connection naming one
 * would have its stored key written into a header the transport itself sets:
 * `Authorization` silently replaces whatever authentication the request was
 * making, `Host` redirects virtual-host routing, `Cookie` attaches a bearer to
 * the wrong origin. None of those is API-key authentication; each is a way to
 * make the request something other than what it says it is — and the header
 * name is operator-supplied, so the rule belongs in code, not in a convention.
 *
 * Checked in BOTH places on purpose: the form guards the next write, and the
 * header builder guards the rows that were stored before the rule existed.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_API_KEY_HEADER, isAllowedApiKeyHeader } from "@/lib/sap-public/api-key-header";
import {
  buildAuthHeadersFromConnection,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";

function apiKeyConnection(apiKeyHeader?: string): ResolvedSapConnection {
  return {
    source: "db",
    id: "conn_1",
    organizationId: "org_a",
    product: "s4hana",
    key: "sandbox",
    label: "SAP API Business Hub sandbox",
    baseUrl: "https://sandbox.api.sap.com",
    authType: "api-key",
    secrets: { apiKey: "the-key", ...(apiKeyHeader === undefined ? {} : { apiKeyHeader }) },
    oauthTokenUrl: null,
    writeEnabled: false,
    apiPath: null,
    timeoutMs: null,
    environment: "SANDBOX",
    client: null,
  } as ResolvedSapConnection;
}

describe("isAllowedApiKeyHeader", () => {
  it("accepts the default and the header names a gateway actually uses", () => {
    for (const name of [DEFAULT_API_KEY_HEADER, "APIKey", "X-API-Key", "x-sap-apikey"]) {
      expect(isAllowedApiKeyHeader(name), name).toBe(true);
    }
  });

  it("refuses the headers that carry authentication of their own", () => {
    for (const name of ["Authorization", "authorization", "Proxy-Authorization", "Cookie", "Set-Cookie"]) {
      expect(isAllowedApiKeyHeader(name), name).toBe(false);
    }
  });

  it("refuses the headers that decide where and how the request is sent", () => {
    for (const name of ["Host", "Content-Length", "Content-Type", "Transfer-Encoding", "Connection"]) {
      expect(isAllowedApiKeyHeader(name), name).toBe(false);
    }
  });

  it("still refuses what the old regex refused", () => {
    for (const name of ["", "   ", "x api key", "x_api_key", "x:key", "x".repeat(81)]) {
      expect(isAllowedApiKeyHeader(name), JSON.stringify(name)).toBe(false);
    }
  });
});

describe("buildAuthHeadersFromConnection", () => {
  it("sends the key in the named header and no Authorization", async () => {
    const headers = await buildAuthHeadersFromConnection(apiKeyConnection("X-API-Key"));
    expect(headers).toEqual({ "X-API-Key": "the-key" });
  });

  it("falls back to SAP's own default when the row names none", async () => {
    const headers = await buildAuthHeadersFromConnection(apiKeyConnection());
    expect(headers).toEqual({ [DEFAULT_API_KEY_HEADER]: "the-key" });
  });

  /*
   * A row stored before the rule existed. The call fails loudly rather than
   * sending the key as an Authorization header — a request that authenticates
   * as something nobody configured is worse than a request that does not go.
   */
  it("refuses to send a stored row's key in a reserved header", async () => {
    await expect(buildAuthHeadersFromConnection(apiKeyConnection("Authorization"))).rejects.toThrow(
      /reserved for the transport/,
    );
  });
});
