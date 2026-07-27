/**
 * The connection-aware read, and the honest status it reports.
 *
 * The assertion that matters most is the boring-looking one: an empty result is
 * a 200. Returning 404 for "the service answered and had nothing" is the single
 * most damaging lie this broker could tell — every consumer would learn to treat
 * "no orders today" as an outage.
 */

import { describe, expect, it, vi } from "vitest";

import { httpStatusFor, readEntitySet } from "@/lib/northbound/read";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

function conn(overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection {
  return {
    source: "db",
    id: "c1",
    organizationId: "org_a",
    product: "s4hana",
    key: "prod",
    label: "Acme S/4",
    baseUrl: "https://my1234-api.s4hana.cloud.sap",
    authType: "basic",
    secrets: { username: "u", password: "p" },
    oauthTokenUrl: null,
    writeEnabled: false,
    apiPath: null,
    timeoutMs: null,
    environment: null,
    ...overrides,
  };
}

function res(status: number, body: unknown) {
  return {
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

const INPUT = { servicePath: "/sap/opu/odata/sap/API_TEST", entitySet: "A_Thing", limit: 10 };

describe("honest status", () => {
  it("200 with rows → OK", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { value: [{ a: 1 }, { a: 2 }] }));
    const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    expect(r.status).toBe("OK");
    expect(r.records).toHaveLength(2);
  });

  it("200 with ZERO rows → EMPTY, and still an HTTP 200", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { value: [] }));
    const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    expect(r.status).toBe("EMPTY");
    expect(r.records).toEqual([]);
    // The line that stops every consumer misreading "nothing today" as a fault.
    expect(httpStatusFor(r.status)).toBe(200);
    expect(r.detail.toLowerCase()).toContain("no records");
  });

  it("401/403 → NEEDS_SETUP → 403", async () => {
    for (const code of [401, 403]) {
      const f = vi.fn().mockResolvedValue(res(code, ""));
      const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
      expect(r.status, `HTTP ${code}`).toBe("NEEDS_SETUP");
      expect(httpStatusFor(r.status)).toBe(403);
    }
  });

  it("404 → NOT_FOUND → 404", async () => {
    const f = vi.fn().mockResolvedValue(res(404, ""));
    const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    expect(r.status).toBe("NOT_FOUND");
    expect(httpStatusFor(r.status)).toBe(404);
  });

  it("5xx → ERROR → 502 (a broker failure, not the caller's fault)", async () => {
    const f = vi.fn().mockResolvedValue(res(503, ""));
    const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    expect(r.status).toBe("ERROR");
    expect(httpStatusFor(r.status)).toBe(502);
  });

  it("an abort → TIMEOUT → 504", async () => {
    const f = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    expect(r.status).toBe("TIMEOUT");
    expect(httpStatusFor(r.status)).toBe(504);
  });
});

describe("OData shapes", () => {
  it("reads v4 `value`", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { value: [{ id: 1 }] }));
    const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    expect(r.records).toEqual([{ id: 1 }]);
  });

  it("reads v2 `d.results`", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { d: { results: [{ id: 2 }] } }));
    const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    expect(r.records).toEqual([{ id: 2 }]);
  });

  it("survives a non-JSON error body instead of crashing", async () => {
    // SAP error pages are frequently HTML or XML; JSON.parse throwing on one
    // would surface as a generic 500 rather than the honest status the response
    // code already told us.
    const f = vi.fn().mockResolvedValue(res(403, "<html>Forbidden</html>"));
    const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    expect(r.status).toBe("NEEDS_SETUP");
  });
});

describe("what it sends, and what it never says", () => {
  it("reads through the CONNECTION's own base URL, not an env tenant", async () => {
    // Reading a different SAP system and returning those rows under this
    // client's token would serve one customer another's data.
    const f = vi.fn().mockResolvedValue(res(200, { value: [] }));
    await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://my1234-api.s4hana.cloud.sap/sap/opu/odata/sap/API_TEST/A_Thing");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("caps the row limit", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { value: [] }));
    await readEntitySet({ connection: conn(), ...INPUT, limit: 5000 }, f as unknown as typeof fetch);
    expect((f.mock.calls[0] as [string])[0]).toContain("$top=100");
  });

  it("floors a nonsense limit rather than sending it", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { value: [] }));
    await readEntitySet({ connection: conn(), ...INPUT, limit: -3 }, f as unknown as typeof fetch);
    expect((f.mock.calls[0] as [string])[0]).toContain("$top=1");
  });

  it("never leaks the secret or the host in its result", async () => {
    const f = vi.fn().mockRejectedValue(new Error("ENOTFOUND my1234-api.s4hana.cloud.sap"));
    const r = await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("s4hana.cloud.sap");
    expect(serialized).not.toContain("ENOTFOUND");
    expect(serialized).not.toContain("password");
  });

  it("only ever issues a GET", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { value: [] }));
    await readEntitySet({ connection: conn(), ...INPUT }, f as unknown as typeof fetch);
    expect((f.mock.calls[0]?.[1] as RequestInit).method).toBe("GET");
  });
});
