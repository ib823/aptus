// @vitest-environment node
/**
 * Who states X-RateLimit-Remaining on a query's answer (P1.4, D23).
 *
 * The edge set X-RateLimit-Remaining from its machine-credential bucket (600
 * a minute) on the pass-through response, and Next keeps a header set there
 * over the route's: a query's answer said limit 60, remaining about 599, and
 * a paging run paced by it met 429 after 60 calls. On a data read carrying a
 * query-surface name the edge now hands its figure to the route, which states
 * the smaller of it and the key's own; every other request keeps the edge's
 * header as it was.
 *
 * Driven through the real middleware and the in-memory limiter. A header
 * middleware forwards to the route appears on its response as
 * `x-middleware-request-<name>`.
 */

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EDGE_RATE_REMAINING_HEADER, rateRemaining, routeStatesRateRemaining } from "@/lib/northbound/query/rate-headers";
import { middleware } from "@/middleware";

const DATA = "/api/northbound/interfaces/if_1/data";
const forwarded = (res: Response) => res.headers.get(`x-middleware-request-${EDGE_RATE_REMAINING_HEADER}`);

function call(path: string, ip: string, headers: Record<string, string> = {}) {
  return middleware(new NextRequest(`http://localhost${path}`, { headers: { "x-real-ip": ip, authorization: "Bearer ce_test_rate_headers", ...headers } }));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a query's answer", () => {
  it.each(["credential", "ip"])("carries no edge X-RateLimit-Remaining; the edge's figure goes to the route (COREEDGE_MACHINE_RATE_LIMIT=%s)", async (mode) => {
    vi.stubEnv("COREEDGE_MACHINE_RATE_LIMIT", mode);
    const ip = mode === "ip" ? "198.51.100.71" : "198.51.100.70";
    for (const path of [`${DATA}?filter.Customer.eq=C1&pageSize=2`, `/api/northbound/v1/interfaces/if_1/data?select=Order`, `${DATA}?cursor=x`]) {
      const res = await call(path, ip);
      expect(res.headers.get("x-middleware-next")).toBe("1");
      expect(res.headers.get("X-RateLimit-Remaining")).toBeNull();
      expect(Number(forwarded(res))).toBeGreaterThan(0);
    }
  });

  it("states the smaller of the key's own calls left and the edge's", () => {
    expect(rateRemaining(42, "590")).toBe(42);
    expect(rateRemaining(42, "7")).toBe(7);
    expect(rateRemaining(42, null)).toBe(42);
    expect(rateRemaining(-1, "590")).toBe(0);
    for (const bad of ["", "-3", "1e3", "x", "9".repeat(10)]) expect(rateRemaining(42, bad)).toBe(42);
  });
});

describe("every other request", () => {
  it("keeps the edge's X-RateLimit-Remaining and hands nothing to the route: a ?limit read, a write, /schema", async () => {
    for (const [path, method] of [
      [`${DATA}?limit=5`, "GET"],
      [DATA, "GET"],
      [`${DATA}/write`, "POST"],
      ["/api/northbound/interfaces/if_1/schema?select=x", "GET"],
    ] as const) {
      const res = await middleware(new NextRequest(`http://localhost${path}`, { method, headers: { "x-real-ip": "198.51.100.72", authorization: "Bearer ce_test_rate_headers_2" } }));
      expect(res.headers.get("X-RateLimit-Remaining"), path).toMatch(/^[0-9]+$/);
      expect(forwarded(res), path).toBeNull();
    }
    expect(routeStatesRateRemaining("POST", DATA, new URLSearchParams("select=x"))).toBe(false);
  });

  it("never passes on a figure the caller sent", async () => {
    const res = await call(`${DATA}?limit=5`, "198.51.100.73", { [EDGE_RATE_REMAINING_HEADER]: "1" });
    expect(forwarded(res)).toBeNull();
    const query = await call(`${DATA}?select=Order`, "198.51.100.73", { [EDGE_RATE_REMAINING_HEADER]: "1" });
    expect(Number(forwarded(query))).toBeGreaterThan(1);
  });
});
