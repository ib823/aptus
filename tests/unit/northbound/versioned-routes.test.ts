// @vitest-environment node
/**
 * The v1 path is the original path, by construction (roadmap P1.10).
 *
 * `/api/northbound/v1/*` must serve exactly what `/api/northbound/*` serves:
 * the same edge limits, authentication, per-credential limits, grant binding,
 * audit rows and correlation ids. The way that is guaranteed is that there is
 * ONE handler per route, re-exported under v1, and wrapped once for the
 * version. This suite proves the construction: every route exists on both
 * paths, each v1 export IS the original function, every handler is wrapped,
 * and the wrapper and the edge state the version. The behaviour on both paths
 * against a real database is tests/integration/northbound-versioning.test.ts.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
    },
  },
}));

import { recordNorthboundCall } from "@/lib/northbound/audit";
import { currentNorthboundCall, isVersionedHandler, withNorthboundVersion } from "@/lib/northbound/versioned-route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { middleware } from "@/middleware";

const ROOT = path.join(process.cwd(), "src/app/api/northbound");
const V1 = path.join(ROOT, "v1");

/** Every route.ts under `dir`, as a path relative to it. */
function routes(dir: string, skip?: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      if (full === skip) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") out.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return out.sort();
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const load = (file: string) => import(/* @vite-ignore */ file) as Promise<Record<string, unknown>>;

describe("one implementation, two paths", () => {
  const original = routes(ROOT, V1);
  const aliased = routes(V1);

  it("every northbound route exists under v1, and v1 has nothing else", () => {
    expect(original).toEqual([
      "interfaces/[id]/data/route.ts",
      "interfaces/[id]/data/write/route.ts",
      "interfaces/[id]/schema/route.ts",
      "interfaces/route.ts",
      "versions/route.ts",
    ]);
    expect(aliased).toEqual(original);
  });

  it.each(original)("v1/%s exports the very function the original path exports", async (rel) => {
    // One after the other: loading both at once races the module cache, and
    // the v1 file's own import of the original can then evaluate it a second
    // time, as a different function (a flake, seen about one run in three).
    const base = await load(path.join(ROOT, rel));
    const v1 = await load(path.join(V1, rel));
    const methods = METHODS.filter((m) => typeof base[m] === "function");
    expect(methods.length).toBeGreaterThan(0);
    expect(METHODS.filter((m) => typeof v1[m] === "function")).toEqual(methods);
    for (const m of methods) {
      // Identity, not equivalence: a copy-pasted handler would pass any
      // behavioural test written today and drift with the next change.
      expect(v1[m]).toBe(base[m]);
      expect(isVersionedHandler(base[m]), `${rel} ${m} is not wrapped for the version`).toBe(true);
    }
    expect(v1.dynamic).toBe("force-dynamic");
    expect(base.dynamic).toBe("force-dynamic");
  });
});

describe("the version wrapper", () => {
  const ok = () => NextResponse.json({ data: { ok: true } }, { headers: { "x-correlation-id": "c-1" } });
  const req = (url: string, version?: string) =>
    new NextRequest(url, { headers: version === undefined ? {} : { "CoreEdge-Version": version } });

  it("refuses an unknown version with a typed 400 before the handler runs", async () => {
    const handler = vi.fn(async () => ok());
    const res = await withNorthboundVersion(handler)(req("http://localhost/api/northbound/v1/interfaces", "2025-01"));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: Record<string, unknown> };
    expect(body.error).toMatchObject({
      code: "UNSUPPORTED_VERSION",
      requestedVersion: "2025-01",
      supportedVersions: ["2026-10"],
    });
    expect(String(body.error.message)).toContain("Supported versions: 2026-10");
    expect(res.headers.get("x-correlation-id")).toBe(body.error.correlationId);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // No version served it, so none is claimed.
    expect(res.headers.get("CoreEdge-Version")).toBeNull();
  });

  it.each([
    ["http://localhost/api/northbound/interfaces", undefined, "/api/northbound", false],
    ["http://localhost/api/northbound/v1/interfaces", undefined, "/api/northbound/v1", false],
    ["http://localhost/api/northbound/interfaces/i1/data", "2026-10", "/api/northbound", true],
    ["http://localhost/api/northbound/v1/interfaces/i1/data/write", "2026-10", "/api/northbound/v1", true],
  ] as const)("serves %s (pin %s) inside a context naming the path and version", async (url, version, basePath, pinned) => {
    let seen: unknown;
    const res = await withNorthboundVersion(async () => {
      seen = currentNorthboundCall();
      return ok();
    })(req(url, version));
    expect(seen).toEqual({ apiVersion: "2026-10", pinned, apiBasePath: basePath });
    expect(res.headers.get("CoreEdge-Version")).toBe("2026-10");
    // The handler's own headers are untouched.
    expect(res.headers.get("x-correlation-id")).toBe("c-1");
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(currentNorthboundCall()).toBeUndefined();
  });

  it("stamps the version on an error the handler returns, too", async () => {
    const res = await withNorthboundVersion(async () => NextResponse.json({ error: {} }, { status: 401 }))(
      req("http://localhost/api/northbound/interfaces"),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("CoreEdge-Version")).toBe("2026-10");
  });
});

describe("the audit row names the path and version that served the call", () => {
  beforeEach(() => created.splice(0));

  const row = {
    organizationId: "org",
    solutionId: "sol",
    interfaceId: null,
    operation: "READ" as const,
    externalId: "-discovery-",
    environment: "DEV",
    status: 200,
    rowCount: null,
    correlationId: "c",
    clientTokenId: "client",
  };

  it.each(["/api/northbound", "/api/northbound/v1"])("on %s, from the wrapper's context, with no extra argument", async (base) => {
    await withNorthboundVersion(async () => {
      await recordNorthboundCall(row);
      return NextResponse.json({});
    })(new NextRequest(`http://localhost${base}/interfaces`));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ apiVersion: "2026-10", apiBasePath: base });
  });

  it("outside a northbound call (a console read, a dry run) both stay null", async () => {
    await recordNorthboundCall(row);
    expect(created[0]).toMatchObject({ apiVersion: null, apiBasePath: null });
  });
});

describe("the edge treats both paths as one API", () => {
  afterEach(() => vi.unstubAllEnvs());

  const call = (p: string, ip: string, bearer: string, version?: string) =>
    middleware(
      new NextRequest(`http://localhost${p}`, {
        headers: {
          "x-real-ip": ip,
          authorization: `Bearer ${bearer}`,
          ...(version ? { "CoreEdge-Version": version } : {}),
        },
      }),
    );

  it("one credential's edge budget is spent by both paths together, and its refusal states the version", async () => {
    const ip = "198.51.100.110";
    const key = "ce_test_versioned_runaway";
    // Half the ceiling on each path. Two buckets would admit all of it.
    const half = Math.ceil(RATE_LIMITS.machineCredential.limit / 2);
    for (let i = 0; i < half; i++) expect((await call("/api/northbound/interfaces", ip, key)).status).not.toBe(429);
    let last: Response | null = null;
    for (let i = 0; i < half + 1; i++) last = await call("/api/northbound/v1/interfaces/i1/data", ip, key);
    expect(last!.status).toBe(429);
    expect(((await last!.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    expect(last!.headers.get("CoreEdge-Version")).toBe("2026-10");
    // And the original path is refused too: it is the same bucket.
    const again = await call("/api/northbound/interfaces", ip, key, "2026-10");
    expect(again.status).toBe(429);
    expect(again.headers.get("CoreEdge-Version")).toBe("2026-10");
    // A version the route would refuse is not claimed at the edge.
    expect((await call("/api/northbound/interfaces", ip, key, "1999-01")).headers.get("CoreEdge-Version")).toBeNull();
  });

  it.each(["/api/northbound/interfaces", "/api/northbound/v1/interfaces"])(
    "%s: the per-address 429 a call meets with COREEDGE_MACHINE_RATE_LIMIT=ip states the version too",
    async (p) => {
      // The documented P0.5 rollback: every machine call takes the per-IP bucket.
      vi.stubEnv("COREEDGE_MACHINE_RATE_LIMIT", "ip");
      const ip = p.includes("/v1/") ? "198.51.100.112" : "198.51.100.113";
      let last: Response | null = null;
      for (let i = 0; i < RATE_LIMITS.apiRead.limit + 1; i++) last = await call(p, ip, "ce_test_ip_mode_key", "2026-10");
      expect(last!.status).toBe(429);
      expect(((await last!.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(last!.headers.get("CoreEdge-Version")).toBe("2026-10");
      // Still not claimed for a version the route would refuse.
      expect((await call(p, ip, "ce_test_ip_mode_key", "1999-01")).headers.get("CoreEdge-Version")).toBeNull();
    },
  );

  it("the per-address 429 for a call with no bearer states the version; off the northbound API it does not", async () => {
    const anonymous = (p: string, ip: string) =>
      middleware(new NextRequest(`http://localhost${p}`, { headers: { "x-real-ip": ip } }));
    let last: Response | null = null;
    for (let i = 0; i < RATE_LIMITS.apiRead.limit + 1; i++) last = await anonymous("/api/northbound/versions", "198.51.100.114");
    expect(last!.status).toBe(429);
    expect(last!.headers.get("CoreEdge-Version")).toBe("2026-10");
    for (let i = 0; i < RATE_LIMITS.apiRead.limit + 1; i++) last = await anonymous("/api/studio/solutions", "198.51.100.115");
    expect(last!.status).toBe(429);
    expect(last!.headers.get("CoreEdge-Version")).toBeNull();
  });

  it("admits a call on either path the same way, leaving the version to the route", async () => {
    for (const p of ["/api/northbound/interfaces", "/api/northbound/v1/interfaces"]) {
      const res = await call(p, "198.51.100.111", "ce_test_quiet_key");
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
      expect(res.headers.get("x-ratelimit-remaining")).not.toBeNull();
    }
  });
});

describe("GET /versions, the changelog as JSON", () => {
  it.each(["/api/northbound/versions", "/api/northbound/v1/versions"])("is served at %s without a credential", async (p) => {
    const { GET } = (await import("@/app/api/northbound/versions/route")) as {
      GET: (r: NextRequest) => Promise<Response>;
    };
    const res = await GET(new NextRequest(`http://localhost${p}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("CoreEdge-Version")).toBe("2026-10");
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      header: "CoreEdge-Version",
      defaultVersion: "2026-10",
      supportedVersions: ["2026-10"],
      basePaths: ["/api/northbound/v1", "/api/northbound"],
      policy: { minimumOverlapMonths: 6 },
    });
    expect((data.versions as { version: string; status: string }[])[0]).toMatchObject({
      version: "2026-10",
      status: "supported",
      releasedOn: "2026-10-24",
    });
  });
});
