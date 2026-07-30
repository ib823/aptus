/**
 * Connection health — the honest-status rules, exercised against a fake fetch.
 *
 * The rule that carries the weight: `lastValidatedAt` moves ONLY on a real 200.
 * Everything else here exists so that "not set up" (401/403) never gets rounded
 * into "unreachable" (5xx/timeout), because those are different problems with
 * different fixes and a consultant chasing the wrong one wastes a day.
 */

import { describe, expect, it, vi } from "vitest";

import { probeConnection, resolveProbePath } from "@/lib/studio/connection-health";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

function conn(overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection {
  return {
    source: "db",
    id: "c1",
    organizationId: "org_a",
    product: "s4hana",
    key: "prod",
    label: "Acme S/4 (PROD)",
    baseUrl: "https://my123456-api.s4hana.cloud.sap",
    authType: "basic",
    secrets: { username: "comm_user", password: "s3cret" },
    oauthTokenUrl: null,
    writeEnabled: false,
    apiPath: "/sap/opu/odata/sap/API_TEST_SRV",
    timeoutMs: null,
    environment: null,
    client: null,
    ...overrides,
  };
}

const okFetch = (status: number) =>
  vi.fn().mockResolvedValue({ status, ok: status === 200 }) as unknown as typeof fetch;

describe("outcome classification", () => {
  it("200 → OK (the only outcome that counts as validated)", async () => {
    const r = await probeConnection(conn(), okFetch(200));
    expect(r.status).toBe("OK");
    expect(r.httpStatus).toBe(200);
  });

  it("401 and 403 → UNAUTHORIZED, not a generic error", async () => {
    for (const code of [401, 403]) {
      const r = await probeConnection(conn(), okFetch(code));
      expect(r.status, `HTTP ${code}`).toBe("UNAUTHORIZED");
    }
  });

  it("404 → NOT_FOUND, kept apart from a credentials problem", async () => {
    const r = await probeConnection(conn(), okFetch(404));
    expect(r.status).toBe("NOT_FOUND");
  });

  it("5xx → ERROR", async () => {
    const r = await probeConnection(conn(), okFetch(503));
    expect(r.status).toBe("ERROR");
    expect(r.httpStatus).toBe(503);
  });

  it("an aborted request → TIMEOUT, never silently OK", async () => {
    const abort = vi.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    ) as unknown as typeof fetch;
    const r = await probeConnection(conn(), abort);
    expect(r.status).toBe("TIMEOUT");
    expect(r.httpStatus).toBeNull();
  });

  it("a transport failure → ERROR with no detail leaked from the exception", async () => {
    const boom = vi.fn().mockRejectedValue(
      new Error("getaddrinfo ENOTFOUND my123456-api.s4hana.cloud.sap"),
    ) as unknown as typeof fetch;
    const r = await probeConnection(conn(), boom);
    expect(r.status).toBe("ERROR");
    // The host must not ride out on the message shown to the client.
    expect(r.detail).not.toContain("s4hana.cloud.sap");
    expect(r.detail).not.toContain("ENOTFOUND");
  });
});

describe("what the probe sends", () => {
  it("issues a single read-only GET against $metadata with an auth header", async () => {
    const f = vi.fn().mockResolvedValue({ status: 200 });
    await probeConnection(conn(), f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://my123456-api.s4hana.cloud.sap/sap/opu/odata/sap/API_TEST_SRV/$metadata");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("never returns the secret it used", async () => {
    const r = await probeConnection(conn(), okFetch(200));
    expect(JSON.stringify(r)).not.toContain("s3cret");
    expect(JSON.stringify(r)).not.toContain("comm_user");
  });
});

describe("probe path resolution", () => {
  it("prefers the connection's explicit apiPath", () => {
    expect(resolveProbePath({ apiPath: "/custom/path", product: "s4hana" })).toBe("/custom/path");
  });

  it("falls back to the product's first curated service", () => {
    const p = resolveProbePath({ apiPath: null, product: "s4hana" });
    expect(p).toBeTruthy();
    expect(p).toMatch(/^\//);
  });

  it("returns null for an unknown product rather than guessing a path", async () => {
    expect(resolveProbePath({ apiPath: null, product: "not_a_product" })).toBeNull();
    const r = await probeConnection(
      conn({ apiPath: null, product: "not_a_product" }),
      okFetch(200),
    );
    // Guessing would surface as NOT_FOUND — "the tenant doesn't have this" —
    // when the truth is that we did not know where to look.
    expect(r.status).toBe("NO_PROBE_PATH");
  });

  it("does not call SAP at all when there is no path to probe", async () => {
    const f = vi.fn();
    await probeConnection(conn({ apiPath: null, product: "not_a_product" }), f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("the connectivity probe is throttled like every other live-SAP route", () => {
  it("is matched by isLiveSapTenantRoute", async () => {
    const { isLiveSapTenantRoute } = await import("@/lib/security/rate-limit");
    expect(isLiveSapTenantRoute("/api/studio/connections/c_123/test")).toBe(true);
  });

  it("does not over-match neighbouring studio paths", () => {
    return import("@/lib/security/rate-limit").then(({ isLiveSapTenantRoute }) => {
      expect(isLiveSapTenantRoute("/api/studio/connections")).toBe(false);
      expect(isLiveSapTenantRoute("/api/studio/connections/c_123")).toBe(false);
      expect(isLiveSapTenantRoute("/api/studio/connections/c_123/test/extra")).toBe(false);
      expect(isLiveSapTenantRoute("/api/studio/interfaces")).toBe(false);
    });
  });
});
