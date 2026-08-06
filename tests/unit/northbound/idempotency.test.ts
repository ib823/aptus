/**
 * Idempotency — the control that stands between a network retry and a duplicate
 * record in a customer's ledger.
 *
 * This is the piece the write path was withheld for, so it is tested for what
 * must never happen: the same intent reaching SAP twice, a different payload
 * quietly replaying an old success, and a reopened key carrying a stale response.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundIdempotencyKey: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.del,
    },
  },
}));

import {
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
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "idem_1" });
  mocks.update.mockResolvedValue({});
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
    expect(data.requestHash).toBe(hashRequest(PAYLOAD));
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
      requestHash: hashRequest(PAYLOAD),
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
      requestHash: hashRequest(PAYLOAD),
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
      requestHash: hashRequest(PAYLOAD),
      status: null,
      responseBody: null,
      expiresAt: new Date(NOW.getTime() + 1000),
    });
    const r = await reserveIdempotencyKey(INPUT, NOW);
    expect(r.outcome).toBe("conflict");
    if (r.outcome === "conflict") expect(r.reason).toBe("IN_FLIGHT");
  });

  it("treats a lost insert race as in-flight — the unique constraint is the guarantee", async () => {
    // Two concurrent requests with one key: exactly one can insert.
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockRejectedValue(new Error("unique constraint violation"));
    const r = await reserveIdempotencyKey(INPUT, NOW);
    expect(r.outcome).toBe("conflict");
    if (r.outcome === "conflict") expect(r.reason).toBe("IN_FLIGHT");
  });
});

describe("expiry", () => {
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
    const data = mocks.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBeNull();
    expect(data.responseBody).not.toBeUndefined();
    expect(data.requestHash).toBe(hashRequest(PAYLOAD));
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
