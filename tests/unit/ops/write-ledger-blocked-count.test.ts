/**
 * The write ledger's `blocked` count, evaluated against real rows.
 *
 * The count's `where` was built as `{ ...failedWriteWhere, status: { not: 409 } }`.
 * The spread REPLACES `status: { gte: 400 }` rather than adding to it, so every
 * WRITE in the window except a 409 was counted as blocked — a fresh 201 create
 * included. The screen shows that number as "Refused before reserving", and it
 * also drives `truncated` and `rowsAreAPage.auditRows.of`, which then disagreed
 * with the audit page (still on the unspread `where`).
 *
 * A mock that returns a canned number per call cannot see that bug: the `where`
 * looks plausible and the mock never reads it. So these tests run each `where`
 * the route builds against an in-memory audit table instead.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({ audit: [] as Record<string, unknown>[] }));
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

/**
 * The subset of Prisma's filter language the route uses: equality, `null`, and
 * `gte` / `gt` / `lt` / `lte` / `not` / `in` on a scalar or a Date.
 */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([field, cond]) => {
    const value = row[field];
    if (cond === null || typeof cond !== "object" || cond instanceof Date) {
      return same(value, cond);
    }
    return Object.entries(cond as Row).every(([op, arg]) => {
      switch (op) {
        case "gte":
          return value != null && num(value) >= num(arg);
        case "gt":
          return value != null && num(value) > num(arg);
        case "lte":
          return value != null && num(value) <= num(arg);
        case "lt":
          return value != null && num(value) < num(arg);
        case "not":
          return !same(value, arg);
        case "in":
          return (arg as unknown[]).some((a) => same(value, a));
        default:
          throw new Error(`matches(): unsupported operator "${op}" on ${field}`);
      }
    });
  });
}

function num(v: unknown): number {
  return v instanceof Date ? v.getTime() : (v as number);
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) return a != null && b != null && num(a) === num(b);
  return a === b;
}

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: {
      findMany: (args: { where: Row; take?: number }) =>
        Promise.resolve(state.audit.filter((r) => matches(r, args.where)).slice(0, args.take)),
      count: (args: { where: Row }) =>
        Promise.resolve(state.audit.filter((r) => matches(r, args.where)).length),
    },
    // No reservations: these tests are about the audit side only.
    northboundIdempotencyKey: {
      findMany: () => Promise.resolve([]),
      count: () => Promise.resolve(0),
    },
  },
}));

import { GET as writeLedger } from "@/app/api/ops/write-ledger/route";

const SUPPORT = { id: "u_s", email: "support@abeam.test", role: "support", organizationId: "org_a" };

async function ledger() {
  const res = await writeLedger(new NextRequest("https://x.test/api/ops/write-ledger"));
  return (await res.json()).data;
}

let seq = 0;
function audit(over: Row = {}): Row {
  seq += 1;
  return {
    id: `e${seq}`,
    organizationId: "org_a",
    solutionId: "sol_1",
    interfaceId: "if_1",
    operation: "WRITE",
    externalId: "API_X",
    status: 201,
    at: new Date(Date.now() - 60_000),
    correlationId: `c${seq}`,
    clientTokenId: "tok_1",
    // A fresh call, not a same-key replay (those are counted apart).
    replayed: false,
    // Set when the request reached SAP; null when it was refused before.
    durationMs: 120,
    ...over,
  };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getCurrentUser.mockResolvedValue(SUPPORT);
  state.audit = [];
});

describe("the write ledger's blocked count holds only refusals", () => {
  it("does not count a successful 201 create as blocked", async () => {
    // A 504 reached SAP and may have been applied: outcome unknown, not blocked.
    state.audit = [audit({ status: 201 }), audit({ status: 504 })];

    const data = await ledger();

    expect(data.fromAudit.blocked).toBe(0);
    expect(data.fromAudit.outcomeUnknown).toBe(1);
    expect(data.fromAudit.conflicts).toBe(0);
    // The page and the count it is a page of agree, so nothing is "truncated".
    expect(data.auditRows).toHaveLength(1);
    expect(data.provenance.rowsAreAPage.auditRows.of).toBe(1);
    expect(data.truncated).toBe(false);
  });

  it("counts each kind exactly as the audit page lists it", async () => {
    state.audit = [
      audit({ status: 201 }),
      audit({ status: 200 }),
      audit({ status: 409 }),
      // Refused before anything was sent: the one kind that is "blocked".
      audit({ status: 403, durationMs: null }),
      audit({ status: 504 }),
      // Not this ledger's rows: a READ, an old WRITE, another tenant's WRITE.
      audit({ status: 500, operation: "READ" }),
      audit({ status: 504, at: new Date(Date.now() - 48 * 60 * 60 * 1000) }),
      audit({ status: 504, organizationId: "org_b" }),
    ];

    const data = await ledger();
    const kinds = data.auditRows.map((r: { kind: string }) => r.kind);

    expect(data.fromAudit.conflicts).toBe(1);
    expect(data.fromAudit.blocked).toBe(1);
    expect(data.fromAudit.outcomeUnknown).toBe(1);
    expect(kinds.filter((k: string) => k === "conflict")).toHaveLength(data.fromAudit.conflicts);
    expect(kinds.filter((k: string) => k === "blocked")).toHaveLength(data.fromAudit.blocked);
    expect(kinds.filter((k: string) => k === "outcome-unknown")).toHaveLength(data.fromAudit.outcomeUnknown);
    expect(data.provenance.rowsAreAPage.auditRows.of).toBe(data.auditRows.length);
    expect(data.truncated).toBe(false);
  });
});
