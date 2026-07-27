/**
 * The three Definition-of-Done items that a verification pass caught as missing.
 *
 * Written after the fact, which is the point of verifying a build against its own
 * specification rather than against a memory of it:
 *
 *   T3  — OAuth token caching and timeout were listed in the plan and never
 *         implemented. The hardening is now real; these tests hold it there.
 *   #8  — the append-only property held by construction but nothing asserted it,
 *         so a future `updateAudit` helper would have slipped in unnoticed.
 *   #9  — the per-token northbound bucket existed and was never proved to throttle.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/* ── T3 · OAuth caching + timeout ──────────────────────────────────────────── */

vi.mock("@/lib/db/prisma", () => ({ prisma: { sapConnection: { findMany: vi.fn() } } }));

import {
  __fetchOAuthTokenForTest,
  clearOAuthTokenCache,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";

function oauthConn(id = "c1"): ResolvedSapConnection {
  return {
    source: "db",
    id,
    organizationId: "org_a",
    product: "s4hana",
    key: "prod",
    label: "Acme",
    baseUrl: "https://x.example",
    authType: "oauth-client-credentials",
    secrets: { clientId: "sb-x", clientSecret: "shh" },
    oauthTokenUrl: "https://auth.example/oauth/token",
    writeEnabled: false,
    apiPath: null,
    timeoutMs: null,
    environment: null,
  };
}

function tokenRes(token: string, expiresIn?: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, ...(expiresIn ? { expires_in: expiresIn } : {}) }),
  };
}

beforeEach(() => clearOAuthTokenCache());

describe("T3 · the OAuth token is cached across calls", () => {
  it("exchanges once, then serves the cached token", async () => {
    // Without this, every northbound call does TWO round trips — and SAP token
    // endpoints rate-limit, so the broker degrades under the load it exists for.
    const f = vi.fn().mockResolvedValue(tokenRes("tok-1", 3600));
    const conn = oauthConn();
    const a = await __fetchOAuthTokenForTest(conn, f as unknown as typeof fetch, 1_000_000);
    const b = await __fetchOAuthTokenForTest(conn, f as unknown as typeof fetch, 1_000_000);
    expect(a).toBe("tok-1");
    expect(b).toBe("tok-1");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("re-exchanges once the cached token has expired", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenRes("tok-1", 120))
      .mockResolvedValueOnce(tokenRes("tok-2", 120));
    const conn = oauthConn();
    await __fetchOAuthTokenForTest(conn, f as unknown as typeof fetch, 0);
    // 120s TTL minus the 60s safety margin → cached until t=60s.
    const later = await __fetchOAuthTokenForTest(conn, f as unknown as typeof fetch, 61_000);
    expect(later).toBe("tok-2");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("refreshes EARLY, so a token cannot expire mid-flight", async () => {
    const f = vi.fn().mockResolvedValue(tokenRes("tok-1", 120));
    const conn = oauthConn();
    await __fetchOAuthTokenForTest(conn, f as unknown as typeof fetch, 0);
    // At t=59s the token is still valid for 61s, but inside the margin.
    await __fetchOAuthTokenForTest(conn, f as unknown as typeof fetch, 59_999);
    expect(f).toHaveBeenCalledTimes(1);
    await __fetchOAuthTokenForTest(conn, f as unknown as typeof fetch, 60_001);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("caches per CONNECTION — one tenant's token is never served to another", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenRes("tok-A", 3600))
      .mockResolvedValueOnce(tokenRes("tok-B", 3600));
    expect(await __fetchOAuthTokenForTest(oauthConn("cA"), f as unknown as typeof fetch, 0)).toBe("tok-A");
    expect(await __fetchOAuthTokenForTest(oauthConn("cB"), f as unknown as typeof fetch, 0)).toBe("tok-B");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("bounds the token request — a hung endpoint aborts", async () => {
    const f = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(tokenRes("tok", 3600));
    });
    await __fetchOAuthTokenForTest(oauthConn(), f as unknown as typeof fetch, 0);
    expect(f).toHaveBeenCalled();
  });

  it("does not cache a failed exchange", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce(tokenRes("tok-ok", 3600));
    const conn = oauthConn();
    await expect(
      __fetchOAuthTokenForTest(conn, f as unknown as typeof fetch, 0),
    ).rejects.toThrow();
    expect(await __fetchOAuthTokenForTest(conn, f as unknown as typeof fetch, 0)).toBe("tok-ok");
  });
});

/* ── #8 · append-only audit ────────────────────────────────────────────────── */

describe("#8 · the audit trail is append-only", () => {
  const northbound = read("src/lib/northbound/audit.ts");
  const config = read("src/lib/studio/audit.ts");

  it("both audit modules export a write and nothing else", () => {
    // An audit trail that can be edited is not an audit trail. The property held
    // by construction, but nothing asserted it — so a future `updateAudit`
    // helper would have slipped in unnoticed.
    for (const [name, src] of [["northbound", northbound], ["config", config]] as const) {
      const exported = [...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
      expect(exported, `${name} audit exports`).toHaveLength(1);
      expect(exported[0], `${name} audit must export only a writer`).toMatch(/^(record|write)/);
    }
  });

  it("neither module contains an update or delete call on its audit table", () => {
    expect(northbound).not.toMatch(/northboundAuditEvent\s*\.\s*(update|delete|upsert)/);
    expect(config).not.toMatch(/configAudit\s*\.\s*(update|delete|upsert)/);
  });

  it("no module ANYWHERE edits an audit row", () => {
    // The guarantee is worthless if it only holds inside the audit modules —
    // any route could reach for prisma.configAudit.update directly.
    const offenders = walk(path.resolve(ROOT, "src"))
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) =>
        /(configAudit|northboundAuditEvent)\s*\.\s*(update|updateMany|delete|deleteMany|upsert)/.test(
          readFileSync(f, "utf8"),
        ),
      )
      .map((f) => f.replace(`${ROOT}/`, ""));

    expect(
      offenders,
      `These modules mutate an audit trail:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

/* ── #9 · the per-token northbound bucket actually throttles ───────────────── */

describe("#9 · northbound rate limiting", () => {
  it("has its own bucket, separate from the generous API ceiling", async () => {
    const { RATE_LIMITS } = await import("@/lib/security/rate-limit");
    expect(RATE_LIMITS.northbound).toBeTruthy();
    expect(RATE_LIMITS.northbound.limit).toBeLessThan(RATE_LIMITS.apiRead.limit);
  });

  it("throttles a burst on one credential", async () => {
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    const key = `northbound:test-${Math.random().toString(36).slice(2)}`;
    const limit = RATE_LIMITS.northbound.limit;

    let lastAllowed = true;
    for (let i = 0; i < limit; i++) {
      lastAllowed = (await checkRateLimit(key, RATE_LIMITS.northbound)).allowed;
    }
    expect(lastAllowed, "requests within the limit are allowed").toBe(true);

    const overflow = await checkRateLimit(key, RATE_LIMITS.northbound);
    expect(overflow.allowed, "the request past the limit is refused").toBe(false);
    expect(overflow.resetMs).toBeGreaterThan(0);
  });

  it("keys per credential — one runaway client does not throttle another", async () => {
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    const suffix = Math.random().toString(36).slice(2);
    const noisy = `northbound:noisy-${suffix}`;
    const quiet = `northbound:quiet-${suffix}`;

    for (let i = 0; i <= RATE_LIMITS.northbound.limit; i++) {
      await checkRateLimit(noisy, RATE_LIMITS.northbound);
    }
    expect((await checkRateLimit(noisy, RATE_LIMITS.northbound)).allowed).toBe(false);
    // The whole reason the bucket is keyed by token rather than IP.
    expect((await checkRateLimit(quiet, RATE_LIMITS.northbound)).allowed).toBe(true);
  });
});
