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

import { stripSource } from "../../helpers/source";

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
    client: null,
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

  it("a RE-SAVE is never answered from the cache — same id, new credentials, new exchange", async () => {
    /*
     * Saving under an existing key updates the row in place, so the id does not
     * change. Keyed by id alone, the old token went on being served for its
     * whole life (about a day on SuccessFactors), and a Test after a rotation
     * passed without the new credentials ever being used.
     */
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenRes("tok-old", 3600))
      .mockResolvedValueOnce(tokenRes("tok-new-secret", 3600))
      .mockResolvedValueOnce(tokenRes("tok-new-host", 3600));
    const fetchImpl = f as unknown as typeof fetch;
    const before = oauthConn("same-id");
    expect(await __fetchOAuthTokenForTest(before, fetchImpl, 0)).toBe("tok-old");
    // Same row, read again unchanged: still cached.
    expect(await __fetchOAuthTokenForTest(oauthConn("same-id"), fetchImpl, 0)).toBe("tok-old");

    const rotated = { ...before, secrets: { ...before.secrets, clientSecret: "rotated" } };
    expect(await __fetchOAuthTokenForTest(rotated, fetchImpl, 0)).toBe("tok-new-secret");

    // The old token must not travel to a new host, either.
    const moved = { ...rotated, baseUrl: "https://elsewhere.example" };
    expect(await __fetchOAuthTokenForTest(moved, fetchImpl, 0)).toBe("tok-new-host");
    expect(f).toHaveBeenCalledTimes(3);
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

  it("both audit modules export writes and nothing else", () => {
    // An audit trail that can be edited is not an audit trail. The property held
    // by construction, but nothing asserted it — so a future `updateAudit`
    // helper would have slipped in unnoticed. The config module has two
    // writers: ConfigAudit, and PlatformGovernanceAudit for an actor with no tenant.
    for (const [name, src, count] of [["northbound", northbound, 1], ["config", config, 2]] as const) {
      const exported = [...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
      expect(exported, `${name} audit exports`).toHaveLength(count);
      for (const fn of exported) expect(fn, `${name} audit must export only writers`).toMatch(/^(record|write)/);
    }
  });

  it("neither module contains an update or delete call on its audit table", () => {
    expect(northbound).not.toMatch(/northboundAuditEvent\s*\.\s*(update|delete|upsert)/);
    expect(config).not.toMatch(/(configAudit|platformGovernanceAudit)\s*\.\s*(update|delete|upsert)/);
  });

  /*
   * WHAT "APPEND-ONLY" GUARANTEES, stated precisely — because retention now
   * exists and this rule had to say which half it protects.
   *
   * The property is INTEGRITY: no code path rewrites a recorded call to say
   * something other than what happened. That is what makes the trail evidence,
   * and it holds everywhere, with no exceptions, which is why `update`,
   * `updateMany` and `upsert` are still forbidden in every file in `src`.
   *
   * Expiring a row WHOLE, by age, on a stated schedule is a different operation:
   * it leaves no altered version behind and cannot make the trail say anything
   * untrue. `reap.ts` set out the conditions for doing it — "a stated period, a
   * legal basis and a tested exception" — and `retention.ts` meets all three.
   * Append-only and bounded are compatible; append-only and unbounded is just a
   * table nobody decided about, which is what the audit found (E14/E15: no
   * retention, no index on correlationId, and a correlation id the caller was
   * told to quote leading to a lookup with no query path).
   *
   * So deletion is allowed in exactly one named module, and the next two tests
   * are what make that an exception rather than a hole.
   */
  const RETENTION_MODULE = "src/lib/northbound/retention.ts";

  it("no module ANYWHERE rewrites an audit row", () => {
    // No exceptions, including the retention module. An edited audit row is the
    // one thing that would make the trail worthless.
    const offenders = walk(path.resolve(ROOT, "src"))
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) =>
        // The platform trails are held to the same rule: P0.12's PlatformGovernanceAudit is
        // append-only, and P0.7's outcome is a second row, never an update of
        // the first.
        /(configAudit|northboundAuditEvent|platformGovernanceAudit|platformAuditEvent|platformAuditOutcome|platformConsoleRead)\s*\.\s*(update|updateMany|upsert)/.test(
          readFileSync(f, "utf8"),
        ),
      )
      .map((f) => f.replace(`${ROOT}/`, ""));

    expect(
      offenders,
      `These modules rewrite an audit trail:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("only the retention module deletes an audit row", () => {
    // The guarantee is worthless if it only holds inside the audit modules —
    // any route could reach for prisma.configAudit.delete directly. One module
    // may, and it is named here so adding a second is a decision somebody makes
    // in review rather than a line nobody notices.
    const deleters = walk(path.resolve(ROOT, "src"))
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) =>
        /(configAudit|northboundAuditEvent|platformGovernanceAudit|platformAuditEvent|platformAuditOutcome|platformConsoleRead)\s*\.\s*(delete|deleteMany)/.test(
          readFileSync(f, "utf8"),
        ),
      )
      .map((f) => f.replace(`${ROOT}/`, ""));

    expect(deleters).toEqual([RETENTION_MODULE]);
  });

  it("and it deletes only by age, within a tenant", () => {
    // What keeps the exception narrow. A delete that could select on anything
    // but age would be a way to remove a specific inconvenient row, which is
    // editing the trail by subtraction.
    const retention = read(RETENTION_MODULE);
    const deleteCall = /deleteMany\(\{([\s\S]*?)\}\);/.exec(retention)?.[1] ?? "";
    expect(deleteCall, "the delete must exist").not.toBe("");
    expect(deleteCall).toContain("organizationId");
    // Re-checked at deletion time, not merely selected on in the scan above it.
    expect(deleteCall).toMatch(/at:\s*\{\s*lt:\s*cutoff\s*\}/);
    // ConfigAudit — the governance trail — is not swept at all.
    expect(retention).not.toContain("configAudit");
    // Nor PlatformGovernanceAudit (P0.12).
    expect(retention).not.toContain("platformGovernanceAudit");
  });

  it("and on the platform trail it deletes only the console's read rows, by age (P0.14b)", () => {
    // The write-back's rows on the same table (P0.7) record a change made to a
    // client's SAP system and are not swept at any age: every platform delete
    // names the console read action and re-asserts the age, through one predicate.
    const retention = read(RETENTION_MODULE);
    expect(retention).toMatch(/const consoleRead = \{ action: PLATFORM_CONSOLE_READ_ACTION, at: \{ lt: cutoff \} \};/);
    const platformDeletes = [...retention.matchAll(/(platformAuditEvent|platformAuditOutcome)\.deleteMany\(\{([^\n]*)\}\)/g)];
    expect(platformDeletes.map((m) => m[1]).sort()).toEqual(["platformAuditEvent", "platformAuditOutcome"]);
    for (const m of platformDeletes) expect(m[2], m[1]).toContain("consoleRead");
    // The CODE never names a write-back action; the comment above the sweep
    // may, to say why those rows are kept.
    expect(stripSource(retention, "comments")).not.toMatch(/SAP_WORKBENCH_WRITE/);
  });

  it("and the console's own read table only by age (integration review round 4)", () => {
    const retention = read(RETENTION_MODULE);
    const consoleDeletes = [...retention.matchAll(/platformConsoleRead\.deleteMany\(\{([\s\S]*?)\}\);/g)];
    expect(consoleDeletes).toHaveLength(1);
    expect(consoleDeletes[0]![1]).toMatch(/at:\s*\{\s*lt:\s*cutoff\s*\}/);
  });

  it("and the write-back runbook says so, rather than that the platform tables are never deleted from (review round 3)", () => {
    // An operator reading P0.7's runbook was told both tables are append-only
    // with no delete in the code, citing this file, after the console's read
    // rows began to be swept from them.
    const runbook = read("docs/runbooks/sap-workbench-write-back.md").replace(/\s+/g, " ");
    expect(runbook).not.toMatch(/Both tables are append-only: there is no update or delete in the code/);
    expect(runbook).toMatch(/SAP_CONSOLE_READ/);
    expect(runbook).toMatch(/sweepConsoleReads/);
    expect(runbook).toMatch(/NORTHBOUND_AUDIT_RETENTION_DAYS/);
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
