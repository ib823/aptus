/**
 * Idempotency — the control that stands between a network retry and a duplicate
 * record in a customer's ledger.
 *
 * This is the piece the write path was withheld for, so it is tested for what
 * must never happen: the same intent reaching SAP twice, a different payload
 * quietly replaying an old success, and a reopened key carrying a stale response.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  /** The claim's INSERT, when the table would accept it. */
  create: vi.fn(),
  /** The claim's ON CONFLICT arm, when the held row has expired. */
  renew: vi.fn(),
  /** Every claim statement, as sent. */
  claim: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

/** The claim's parameters after the optional stamp's, in claimStatement's order. */
function claimValues(sql: Prisma.Sql) {
  const v = sql.values.slice(-9);
  return {
    recordId: v[0] as string,
    organizationId: v[1] as string,
    solutionId: v[2] as string,
    interfaceId: v[3] as string,
    key: v[4] as string,
    requestHash: v[5] as string,
    now: new Date(v[6] as string),
    expiresAt: new Date(v[7] as string),
  };
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    /*
     * The claim (idempotency.ts claimStatement) against the table as
     * `mocks.findUnique` describes it: a free key is inserted, an expired one
     * renewed, a live one returns no row. tests/integration/
     * northbound-idempotency-race.test.ts runs the real statement.
     */
    $queryRaw: async (sql: Prisma.Sql) => {
      const claimed = await mocks.claim(sql);
      if (claimed !== undefined) return claimed;
      const c = claimValues(sql);
      const existing = (await mocks.findUnique({
        where: { organizationId_solutionId_key: { organizationId: c.organizationId, solutionId: c.solutionId, key: c.key } },
      })) as { expiresAt: Date } | null;
      if (!existing) {
        const { now: _now, recordId, ...data } = c;
        const row = (await mocks.create({ data: { id: recordId, ...data } })) as { id: string } | null;
        return row ? [{ id: row.id }] : [];
      }
      if (existing.expiresAt.getTime() <= c.now.getTime()) {
        return (await mocks.renew({ id: c.recordId })) === 1 ? [{ id: c.recordId }] : [];
      }
      return [];
    },
    northboundIdempotencyKey: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      delete: mocks.del,
    },
  },
}));

import {
  claimStatement,
  completeIdempotencyKey,
  hashRequest,
  IDEMPOTENCY_TTL_MS,
  isValidIdempotencyKey,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
} from "@/lib/northbound/idempotency";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const SCOPE = tenantScopeOf("org_a");
const NOW = new Date("2026-07-25T12:00:00Z");
const PAYLOAD = { record: { Name: "Acme" } };

const INPUT = {
  scope: SCOPE,
  solutionId: "sol_1",
  interfaceId: "if_1",
  key: "order-4471-attempt",
  payload: PAYLOAD,
  destination: {
    environment: "SANDBOX", sapClient: "100", connectionId: "conn_1",
    baseUrl: "https://sandbox.example", servicePath: "/sap/odata/API_TEST",
    entitySet: "A_Thing", interfaceVersion: 1,
  },
};
const REQUEST_HASH = hashRequest({ version: 2, destination: INPUT.destination, payload: PAYLOAD });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "idem_1" });
  mocks.update.mockResolvedValue({});
  mocks.renew.mockResolvedValue(1);
  mocks.claim.mockResolvedValue(undefined);
  mocks.del.mockResolvedValue({});
});

describe("key validation", () => {
  it("accepts a sensible key", () => {
    expect(isValidIdempotencyKey("order-4471-attempt-1")).toBe(true);
    expect(isValidIdempotencyKey("a1b2c3d4")).toBe(true);
  });

  it("rejects keys too short to be unique in practice", () => {
    expect(isValidIdempotencyKey("abc")).toBe(false);
  });

  it("rejects unbounded or exotic keys, so the column is not usable as storage", () => {
    expect(isValidIdempotencyKey("x".repeat(256))).toBe(false);
    expect(isValidIdempotencyKey("has spaces!")).toBe(false);
    expect(isValidIdempotencyKey("")).toBe(false);
  });
});

describe("request fingerprinting", () => {
  it("is stable for the same payload", () => {
    expect(hashRequest(PAYLOAD)).toBe(hashRequest({ record: { Name: "Acme" } }));
  });

  it("ignores property ORDER, so a differently-serialised same request is not a conflict", () => {
    expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ b: 2, a: 1 }));
  });

  it("changes when any value changes", () => {
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
    expect(hashRequest({ record: { Name: "Acme" } })).not.toBe(
      hashRequest({ record: { Name: "Globex" } }),
    );
  });

  it("distinguishes nested differences", () => {
    expect(hashRequest({ a: { b: 1 } })).not.toBe(hashRequest({ a: { b: 2 } }));
  });
});

describe("first use of a key", () => {
  it("reserves it and tells the caller to proceed", async () => {
    const r = await reserveIdempotencyKey(INPUT, NOW);
    expect(r.outcome).toBe("proceed");
    if (r.outcome === "proceed") expect(r.recordId).toBe("idem_1");
  });

  it("stamps the tenant, the fingerprint and an expiry", async () => {
    await reserveIdempotencyKey(INPUT, NOW);
    const data = mocks.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.organizationId).toBe("org_a");
    expect(data.requestHash).toBe(REQUEST_HASH);
    expect((data.expiresAt as Date).getTime()).toBe(NOW.getTime() + IDEMPOTENCY_TTL_MS);
  });

  it("reserves BEFORE any SAP call — the record starts with no outcome", async () => {
    await reserveIdempotencyKey(INPUT, NOW);
    const data = mocks.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBeUndefined();
  });
});

describe("a genuine retry", () => {
  it("replays the recorded outcome instead of writing again", async () => {
    // The whole point: SAP is not touched a second time.
    mocks.findUnique.mockResolvedValue({
      interfaceId: "if_1",
      id: "idem_1",
      requestHash: REQUEST_HASH,
      status: 201,
      responseBody: { created: true, location: "/A_Thing('1')" },
      expiresAt: new Date(NOW.getTime() + 1000),
    });
    const r = await reserveIdempotencyKey(INPUT, NOW);
    expect(r.outcome).toBe("replay");
    if (r.outcome === "replay") {
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ created: true, location: "/A_Thing('1')" });
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("replays a recorded FAILURE too, rather than re-attempting it", async () => {
    // A 403 that is retried should return the same 403 — not try the write the
    // tenant already refused.
    mocks.findUnique.mockResolvedValue({
      id: "idem_1",
      interfaceId: "if_1",
      requestHash: REQUEST_HASH,
      status: 403,
      responseBody: { error: { code: "FORBIDDEN" } },
      expiresAt: new Date(NOW.getTime() + 1000),
    });
    const r = await reserveIdempotencyKey(INPUT, NOW);
    expect(r.outcome).toBe("replay");
    if (r.outcome === "replay") expect(r.status).toBe(403);
  });
});

describe("misuse of a key", () => {
  it.each([
    { environment: "PROD" }, { sapClient: "080" }, { connectionId: "conn_2" },
    { baseUrl: "https://another.example" }, { servicePath: "/another/service" },
    { entitySet: "AnotherEntity" }, { interfaceVersion: 2 },
  ])("refuses an old result when the destination changes: %j", async (change) => {
    mocks.findUnique.mockResolvedValue({
      id: "idem_1", interfaceId: "if_1", requestHash: REQUEST_HASH, status: 201,
      responseBody: { created: true }, expiresAt: new Date(NOW.getTime() + 1000),
    });
    expect(await reserveIdempotencyKey({
      ...INPUT, destination: { ...INPUT.destination, ...change },
    }, NOW)).toEqual({ outcome: "conflict", reason: "PAYLOAD_MISMATCH" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses legacy unbound keys without replaying or starting a new write", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "legacy", interfaceId: "if_1", requestHash: hashRequest(PAYLOAD), status: 201,
      responseBody: { created: true }, expiresAt: new Date(NOW.getTime() + 1000),
    });
    expect(await reserveIdempotencyKey(INPUT, NOW)).toEqual({ outcome: "conflict", reason: "PAYLOAD_MISMATCH" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.renew).not.toHaveBeenCalled();
  });

  it("does not hide a database outage as an insert race", async () => {
    mocks.create.mockRejectedValue(new Error("database unavailable"));
    await expect(reserveIdempotencyKey(INPUT, NOW)).rejects.toThrow("database unavailable");
  });

  it("refuses the same key with a DIFFERENT payload", async () => {
    // Replaying here would make the caller's second, genuinely different write
    // vanish without a trace.
    mocks.findUnique.mockResolvedValue({
      id: "idem_1",
      requestHash: hashRequest({ record: { Name: "SomethingElse" } }),
      status: 201,
      responseBody: {},
      expiresAt: new Date(NOW.getTime() + 1000),
    });
    const r = await reserveIdempotencyKey(INPUT, NOW);
    expect(r.outcome).toBe("conflict");
    if (r.outcome === "conflict") expect(r.reason).toBe("PAYLOAD_MISMATCH");
  });

  it("reports a still-running request rather than starting a second write", async () => {
    mocks.findUnique.mockResolvedValue({
      interfaceId: "if_1",
      id: "idem_1",
      requestHash: REQUEST_HASH,
      status: null,
      responseBody: null,
      expiresAt: new Date(NOW.getTime() + 1000),
    });
    const r = await reserveIdempotencyKey(INPUT, NOW);
    expect(r.outcome).toBe("conflict");
    if (r.outcome === "conflict") expect(r.reason).toBe("IN_FLIGHT");
  });

  it("treats a lost claim race as in-flight — the unique constraint is the guarantee", async () => {
    // Two concurrent requests with one key: exactly one can insert. The loser
    // claims nothing, and the winner's row is gone (released) by its read.
    mocks.claim.mockResolvedValueOnce([]);
    mocks.findUnique.mockResolvedValue(null);
    const r = await reserveIdempotencyKey(INPUT, NOW);
    expect(r.outcome).toBe("conflict");
    if (r.outcome === "conflict") expect(r.reason).toBe("IN_FLIGHT");
  });
});

describe("expiry", () => {
  it("does not proceed when another caller has already renewed or reaped the row", async () => {
    mocks.claim.mockResolvedValueOnce([]);
    mocks.findUnique.mockResolvedValue({
      id: "expired", interfaceId: "if_1", requestHash: REQUEST_HASH,
      expiresAt: new Date(NOW.getTime() - 1),
    });
    expect(await reserveIdempotencyKey(INPUT, NOW)).toEqual({ outcome: "conflict", reason: "IN_FLIGHT" });
    mocks.claim.mockResolvedValueOnce([]);
    mocks.findUnique.mockResolvedValue(null);
    expect(await reserveIdempotencyKey(INPUT, NOW)).toEqual({ outcome: "conflict", reason: "IN_FLIGHT" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("treats an expired key as fresh — it is not a retry of anything", async () => {
    mocks.findUnique.mockResolvedValue({
      interfaceId: "if_1",
      id: "idem_1",
      requestHash: hashRequest({ old: true }),
      status: 201,
      responseBody: { created: true },
      expiresAt: new Date(NOW.getTime() - 1),
    });
    const r = await reserveIdempotencyKey(INPUT, NOW);
    expect(r.outcome).toBe("proceed");
    // A new ownership token, so the old reservation's late completion misses.
    if (r.outcome === "proceed") expect(r.recordId).not.toBe("idem_1");
    expect(mocks.renew).toHaveBeenCalledTimes(1);
  });

  it("CLEARS the stale response when reopening an expired key", async () => {
    // Leaving it would let a later retry replay a result from a completely
    // different request. `undefined` would have done exactly that, because to
    // Prisma it means "leave the column alone".
    mocks.findUnique.mockResolvedValue({
      interfaceId: "if_1",
      id: "idem_1",
      requestHash: hashRequest({ old: true }),
      status: 201,
      responseBody: { created: true },
      expiresAt: new Date(NOW.getTime() - 1),
    });
    await reserveIdempotencyKey(INPUT, NOW);
    const sql = flat((mocks.claim.mock.calls[0]?.[0] as Prisma.Sql).text);
    const renewal = sql.slice(sql.indexOf("ON CONFLICT"));
    for (const column of ["id", "requestHash", "interfaceId", "createdAt", "expiresAt"]) {
      expect(renewal).toContain(`"${column}" = EXCLUDED."${column}"`);
    }
    expect(renewal).toContain('"status" = NULL');
    expect(renewal).toContain('"responseBody" = NULL');
    // ...and only a row past its expiry is renewed; a live one is left alone.
    expect(renewal).toMatch(/WHERE "NorthboundIdempotencyKey"\."expiresAt" <= \(\$\d+::timestamptz AT TIME ZONE 'UTC'\) RETURNING "id"$/);
  });
});

const flat = (sql: string) => sql.replace(/\s+/g, " ").trim();

/*
 * The claim is a raw statement, which the tenant guard (lib/db/tenant-guard.ts)
 * does not see; the scoping it would demand is in the SQL, pinned here.
 */
describe("the claim statement", () => {
  const base = {
    recordId: "rec_new", organizationId: "org_a", solutionId: "sol_1", interfaceId: "if_1",
    key: "order-4471-attempt", requestHash: REQUEST_HASH, now: NOW,
  };

  it("inserts for the caller's organisation, every value bound as a parameter", () => {
    const sql = claimStatement({ ...base, stamp: null });
    expect(flat(sql.sql)).not.toMatch(/org_a|sol_1|order-4471/);
    expect(sql.values.slice(0, 6)).toEqual(["rec_new", "org_a", "sol_1", "if_1", "order-4471-attempt", REQUEST_HASH]);
    expect(flat(sql.sql)).toContain('ON CONFLICT ("organizationId", "solutionId", "key")');
    expect(flat(sql.sql)).not.toContain("SolutionClient");
    // A UTC instant, whatever the session's zone: a timestamp(3) column holds UTC.
    expect(sql.values).toContain(NOW.toISOString());
    expect(sql.values).toContain(new Date(NOW.getTime() + IDEMPOTENCY_TTL_MS).toISOString());
  });

  it("stamps only the credential's own row in the caller's organisation, once a minute", () => {
    const at = new Date(NOW.getTime() + 5);
    const staleBefore = new Date(at.getTime() - 60_000);
    const sql = claimStatement({ ...base, stamp: { clientId: "client_1", at, staleBefore } });
    const text = flat(sql.text);
    const stamp = text.slice(text.indexOf('WITH "stamp"'), text.indexOf("INSERT"));
    expect(stamp).toMatch(/^WITH "stamp" AS \( UPDATE "SolutionClient" SET "lastUsedAt" = \(\$1::timestamptz AT TIME ZONE 'UTC'\), "updatedAt" = \(\$2::timestamptz AT TIME ZONE 'UTC'\) WHERE "id" = \$3 AND "organizationId" = \$4 AND \("lastUsedAt" IS NULL OR "lastUsedAt" < \(\$5::timestamptz AT TIME ZONE 'UTC'\)\) \) $/);
    expect(sql.values.slice(0, 5)).toEqual([at.toISOString(), at.toISOString(), "client_1", "org_a", staleBefore.toISOString()]);
  });

  it("carries the stamp it is given into the reservation's statement", async () => {
    const stamp = { clientId: "client_1", at: NOW, staleBefore: new Date(NOW.getTime() - 60_000) };
    await reserveIdempotencyKey({ ...INPUT, stamp }, NOW);
    const sql = mocks.claim.mock.calls[0]?.[0] as Prisma.Sql;
    expect(flat(sql.sql)).toContain('UPDATE "SolutionClient"');
    expect(sql.values).toContain("client_1");
  });
});

describe("recording the outcome", () => {
  it("stores the status and body for a later replay", async () => {
    await completeIdempotencyKey(SCOPE, "idem_1", 201, { created: true });
    const data = mocks.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe(201);
    expect(data.responseBody).toEqual({ created: true });
  });

  it("never throws — the write already succeeded", async () => {
    // Losing the caller's result because bookkeeping failed is the worse
    // outcome. Failing here degrades to IN_FLIGHT on retry, which fails SAFE:
    // it does not write twice.
    mocks.update.mockRejectedValue(new Error("db down"));
    await expect(completeIdempotencyKey(SCOPE, "idem_1", 201, {})).resolves.toBeUndefined();
  });
});

describe("releasing a reservation", () => {
  it("removes a key whose request never reached SAP", async () => {
    // Otherwise a client that fixed their payload and retried with the same key
    // would be told it is in flight forever.
    await releaseIdempotencyKey(SCOPE, "idem_1");
    // The tenant travels with the mutation — the model is tenant-anchored.
    expect(mocks.del).toHaveBeenCalledWith({ where: { id: "idem_1", organizationId: "org_a" } });
  });

  it("never throws", async () => {
    mocks.del.mockRejectedValue(new Error("gone"));
    await expect(releaseIdempotencyKey(SCOPE, "idem_1")).resolves.toBeUndefined();
  });
});
