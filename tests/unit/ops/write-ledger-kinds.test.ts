/**
 * The write ledger says "blocked" only for a write that never reached SAP
 * (audit A06).
 *
 * Every WRITE audit row at 400 or above except a 409 was labelled "blocked",
 * and the header defined blocked as a refusal before SAP. So a PROD write whose
 * POST timed out (504 — SAP may have committed it) read as blocked; an operator
 * told the customer nothing was written, and the developer resubmitted under a
 * new key: a duplicate in the customer's ledger. The provenance also described
 * a reservation "deleted when released" that no code path ever releases.
 *
 * The audit table is held in memory and the route's own `where` clauses are
 * evaluated against it, so the counts asserted are the ones the database would
 * return.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as writeLedger } from "@/app/api/ops/write-ledger/route";

interface AuditRow {
  id: string;
  organizationId: string;
  solutionId: string;
  interfaceId: string;
  externalId: string;
  operation: "READ" | "WRITE";
  status: number;
  durationMs: number | null;
  correlationId: string;
  clientTokenId: string;
  replayed: boolean;
  at: Date;
}

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  audit: [] as unknown[],
}));

const comparable = (v: unknown): unknown => (v instanceof Date ? v.getTime() : v);

/** One column against one Prisma filter. Unknown operators fail loudly. */
function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object" || cond instanceof Date) return comparable(value) === comparable(cond);
  const v = comparable(value) as number;
  for (const [op, arg] of Object.entries(cond as Record<string, unknown>)) {
    const a = comparable(arg) as number;
    if (op === "gte" && !(value !== null && v >= a)) return false;
    else if (op === "lt" && !(value !== null && v < a)) return false;
    else if (op === "not" && (arg === null ? value === null : value === null || v === a)) return false;
    else if (!["gte", "lt", "not"].includes(op)) throw new Error(`unsupported filter ${op}`);
  }
  return true;
}

const select = (where: Record<string, unknown>) =>
  (mocks.audit as AuditRow[]).filter((r) =>
    Object.entries(where).every(([col, cond]) => matchField(r[col as keyof AuditRow], cond)),
  );

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: {
      findMany: (args: { where: Record<string, unknown> }) =>
        Promise.resolve(select(args.where).sort((a, b) => b.at.getTime() - a.at.getTime())),
      count: (args: { where: Record<string, unknown> }) => Promise.resolve(select(args.where).length),
    },
    northboundIdempotencyKey: { findMany: () => Promise.resolve([]), count: () => Promise.resolve(0) },
  },
}));

const SUPPORT = { id: "u_s", email: "support@abeam.test", role: "support", organizationId: "org_a" };

let seq = 0;
const write = (status: number, durationMs: number | null): AuditRow => ({
  id: `e${seq++}`,
  organizationId: "org_a",
  solutionId: "sol_1",
  interfaceId: "if_1",
  externalId: "API_BUSINESS_PARTNER",
  operation: "WRITE",
  status,
  durationMs,
  correlationId: `corr-${seq}`,
  clientTokenId: "tok_1",
  replayed: false,
  at: new Date(Date.now() - 60_000 + seq),
});

interface Ledger {
  fromAudit: { blocked: number; conflicts: number; upstreamFailed: number; outcomeUnknown: number; replayed: number };
  auditRows: Array<{ status: number; kind: string }>;
  provenance: { why: string[]; rowsAreAPage: { auditRows: { of: number } } };
}

async function ledger(): Promise<Ledger> {
  const res = await writeLedger(new NextRequest("https://x.test/api/ops/write-ledger"));
  return ((await res.json()) as { data: Ledger }).data;
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getCurrentUser.mockResolvedValue(SUPPORT);
  mocks.audit = [];
});

describe("a failed write is labelled by whether SAP was reached", () => {
  it("never calls a 504 timeout 'blocked' — the write may have been applied", async () => {
    mocks.audit = [write(504, 30_000)];
    const body = await ledger();
    expect(body.auditRows[0]?.kind).toBe("outcome-unknown");
    expect(body.fromAudit).toMatchObject({ blocked: 0, outcomeUnknown: 1 });
  });

  it("calls a 502 with no duration outcome-unknown too — an unmarked replay carries the same outcome", async () => {
    // A replay audited before replays were marked: no duration, replayed=false.
    mocks.audit = [write(502, null)];
    expect((await ledger()).auditRows[0]?.kind).toBe("outcome-unknown");
  });

  it("separates a refusal SAP made from one a gate made", async () => {
    mocks.audit = [
      write(422, 840), // SAP rejected the payload: nothing written.
      write(403, null), // the write-credential gate: SAP never reached.
      write(409, null), // an idempotency conflict.
    ];
    const body = await ledger();
    expect(body.auditRows.map((r) => [r.status, r.kind])).toEqual(
      expect.arrayContaining([
        [422, "upstream-failed"],
        [403, "blocked"],
        [409, "conflict"],
      ]),
    );
    expect(body.fromAudit).toEqual({ blocked: 1, conflicts: 1, upstreamFailed: 1, outcomeUnknown: 0, replayed: 0 });
    expect(body.provenance.rowsAreAPage.auditRows.of).toBe(3);
  });

  it("does not count successful writes as blocked", async () => {
    // Spreading the failed-write where and then setting `status` replaced its
    // `gte: 400`, so every non-409 write in the window counted — 201s included.
    mocks.audit = [write(201, 640), write(201, 700), write(403, null)];
    expect((await ledger()).fromAudit.blocked).toBe(1);
  });
});

describe("the provenance describes the route that exists", () => {
  it("claims a reservation is deleted only for a write that was never sent — no gate releases one", async () => {
    const { why } = (await ledger()).provenance;
    for (const reason of why.filter((r) => /deleted|released/i.test(r))) expect(reason).toMatch(/never sent/);
    expect(why.join(" ")).not.toMatch(/refused after reserving/);
    expect(why.join(" ")).toMatch(/before a key is reserved/);
  });
});
