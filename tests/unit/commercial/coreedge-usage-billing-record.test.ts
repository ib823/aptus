/**
 * The usage rollup is the record pricing will be chosen from, and its header
 * promises it under-counts in the customer's favour. Four ways it did not, and
 * one way it lost a customer's day outright (audit A32, A66, A09, A33).
 *
 *   A32  dryRun rows were billed. A Test Console run and a consultant's console
 *        reads — whose rowCount is entity sets and probes, not records — landed
 *        in Calls, Rows read and Refused, and the deployment tenant's
 *        `-deployment-` sentinel became an organization.
 *   A66  the NULL group counted as a Credential and an Interface, and every
 *        made-up id a key holder requested (404) was one more Interface.
 *   A09  discovery's interface count was summed into Rows read.
 *   A33  a day with ANY organization's row counted as done for all of them, so
 *        a run that failed part-way lost the rest of that day for good.
 *
 * The audit table and the rollup table are held in memory here and the
 * rollup's own `where` clauses are evaluated against them, so what is asserted
 * is what the database would have returned — not which arguments were passed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── an in-memory audit table, queried by the rollup's own where clauses ── */

interface AuditRow {
  organizationId: string;
  solutionId: string | null;
  interfaceId: string | null;
  clientTokenId: string | null;
  operation: "READ" | "WRITE";
  externalId: string;
  status: number;
  rowCount: number | null;
  dryRun: boolean;
  at: Date;
}

interface RollupRow {
  organizationId: string;
  day: Date;
  calls: number;
  rowsRead: number;
  writes: number;
  refusals: number;
  distinctInterfaces: number;
  distinctCredentials: number;
}

const db = vi.hoisted(() => ({
  audit: [] as unknown[],
  rollups: new Map<string, unknown>(),
  /** Throws inside the write of one organization's row, like a dropped connection. */
  failUpsert: null as null | ((organizationId: string, day: Date) => boolean),
}));

const comparable = (v: unknown): unknown => (v instanceof Date ? v.getTime() : v);

/** One column against one Prisma filter. Unknown operators fail loudly. */
function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object" || cond instanceof Date) {
    return comparable(value) === comparable(cond);
  }
  const v = comparable(value) as number;
  for (const [op, arg] of Object.entries(cond as Record<string, unknown>)) {
    const a = comparable(arg) as number;
    if (op === "gte" && !(value !== null && v >= a)) return false;
    else if (op === "lt" && !(value !== null && v < a)) return false;
    else if (op === "in" && !(arg as unknown[]).includes(value)) return false;
    // SQL: `col <> x` is never true for a NULL col; `col IS NOT NULL` for null.
    else if (op === "not" && (arg === null ? value === null : value === null || v === a)) return false;
    else if (!["gte", "lt", "in", "not"].includes(op)) throw new Error(`unsupported filter ${op}`);
  }
  return true;
}

function matches(row: AuditRow, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([col, cond]) => matchField(row[col as keyof AuditRow], cond));
}

function groupBy(args: {
  by: Array<keyof AuditRow>;
  where?: Record<string, unknown>;
  _count?: unknown;
  _sum?: unknown;
}) {
  const groups = new Map<string, AuditRow[]>();
  for (const row of db.audit as AuditRow[]) {
    if (!matches(row, args.where)) continue;
    const key = JSON.stringify(args.by.map((c) => row[c]));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Promise.resolve(
    [...groups.values()].map((rows) => {
      const g: Record<string, unknown> = {};
      for (const c of args.by) g[c] = rows[0]![c];
      g._count = { _all: rows.length };
      const counted = rows.filter((r) => r.rowCount !== null);
      g._sum = { rowCount: counted.length ? counted.reduce((n, r) => n + (r.rowCount ?? 0), 0) : null };
      return g;
    }),
  );
}

/**
 * Prisma's upsert is LAZY: it runs when awaited, or as part of a $transaction
 * batch. Modelled that way so a sequential loop and a batch behave as they
 * would against the database when one write in the middle fails.
 */
function upsert(args: { where: { organizationId_day: { organizationId: string; day: Date } }; create: RollupRow }) {
  const { organizationId, day } = args.where.organizationId_day;
  const run = () => {
    if (db.failUpsert?.(organizationId, day)) throw new Error("connection reset");
    db.rollups.set(`${organizationId}|${day.toISOString()}`, { ...args.create });
  };
  return {
    run,
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      try {
        run();
        return Promise.resolve({}).then(resolve, reject);
      } catch (err) {
        return Promise.reject(err).then(resolve, reject);
      }
    },
  };
}

/** All or nothing, as a database transaction is. */
function transaction(ops: Array<{ run: () => void }>) {
  const before = new Map(db.rollups);
  try {
    for (const op of ops) op.run();
  } catch (err) {
    db.rollups.clear();
    for (const [k, v] of before) db.rollups.set(k, v);
    return Promise.reject(err);
  }
  return Promise.resolve([]);
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: {
      groupBy,
      findFirst: () => {
        const rows = [...(db.audit as AuditRow[])].sort((a, b) => a.at.getTime() - b.at.getTime());
        return Promise.resolve(rows[0] ? { at: rows[0].at } : null);
      },
    },
    coreEdgeUsageRollup: {
      upsert,
      findMany: () => {
        const days = new Set([...db.rollups.values()].map((r) => (r as RollupRow).day.getTime()));
        return Promise.resolve([...days].map((t) => ({ day: new Date(t) })));
      },
    },
    $transaction: transaction,
  },
}));

import { rollupDay, runCoreEdgeUsageRollup } from "@/lib/commercial/coreedge-usage";

const DAY = new Date("2026-10-18T00:00:00.000Z");
const at = (iso: string) => new Date(iso);

/** A deployed app's real read through the broker. */
const brokerRead = (over: Partial<AuditRow> = {}): AuditRow => ({
  organizationId: "org_a",
  solutionId: "sol_1",
  interfaceId: "if_1",
  clientTokenId: "tok_1",
  operation: "READ",
  externalId: "API_BUSINESS_PARTNER",
  status: 200,
  rowCount: 5,
  dryRun: false,
  at: at("2026-10-18T09:00:00.000Z"),
  ...over,
});

/** A consultant's console read: no solution, no credential, dryRun. */
const consoleRead = (over: Partial<AuditRow> = {}): AuditRow =>
  brokerRead({ solutionId: null, interfaceId: null, clientTokenId: null, dryRun: true, ...over });

function rollupFor(organizationId: string, day: Date = DAY): RollupRow | undefined {
  return db.rollups.get(`${organizationId}|${day.toISOString()}`) as RollupRow | undefined;
}

beforeEach(() => {
  db.audit = [];
  db.rollups.clear();
  db.failUpsert = null;
});

describe("A32 — only deployed broker traffic is on the record pricing is chosen from", () => {
  it("leaves Test Console runs, console reads and the deployment sentinel out", async () => {
    db.audit = [
      // The one real call: org_a's deployed app reads 5 rows.
      brokerRead(),
      // A builder presses Run once in the Test Console (10 rows).
      brokerRead({ dryRun: true, rowCount: 10 }),
      // A consultant opens Entities with ?probe=1 on a 120-entity-set service:
      // rowCount is entity sets, then probes — not records.
      consoleRead({ externalId: "API_SVC", rowCount: 120 }),
      consoleRead({ externalId: "-probe-fanout-API_SVC", rowCount: 120 }),
      // ...then gets a 403 NO_APPROVED_GRANT on a PROD connection.
      consoleRead({ status: 403, rowCount: null }),
      // A global admin's read of the deployment tenant, under the sentinel.
      consoleRead({ organizationId: "-deployment-", rowCount: 3 }),
    ];

    await rollupDay(DAY);

    expect(rollupFor("org_a")).toMatchObject({
      calls: 1,
      rowsRead: 5,
      refusals: 0,
      distinctCredentials: 1,
      distinctInterfaces: 1,
    });
    expect(rollupFor("-deployment-"), "the sentinel is not an organization").toBeUndefined();
  });
});

describe("A66 — distinct counts skip the NULL group and caller-chosen ids", () => {
  it("does not count a console read as a credential, or a 429 as an interface", async () => {
    db.audit = [
      brokerRead(),
      // Throttled before the interface was looked at: no interface.
      brokerRead({ interfaceId: null, externalId: "-", status: 429, rowCount: null }),
      consoleRead({ dryRun: false }),
    ];
    await rollupDay(DAY);
    expect(rollupFor("org_a")).toMatchObject({ distinctInterfaces: 1, distinctCredentials: 1 });
  });

  it("does not count 25 made-up interface ids, each refused 404, as 25 interfaces", async () => {
    db.audit = [
      brokerRead(),
      ...Array.from({ length: 25 }, (_, i) =>
        brokerRead({ interfaceId: `rand_${i}`, externalId: "-", status: 404, rowCount: null }),
      ),
    ];
    await rollupDay(DAY);
    expect(rollupFor("org_a")?.distinctInterfaces).toBe(1);
  });
});

describe("A09 — discovery reads no SAP rows", () => {
  it("adds nothing to Rows read, even on rows that recorded the interface count", async () => {
    // Rows written before discovery stopped recording its interface count are
    // still inside retention, so the rollup itself must not sum them.
    db.audit = [
      brokerRead({ rowCount: 7 }),
      ...Array.from({ length: 3 }, () =>
        brokerRead({ interfaceId: null, externalId: "-discovery-", rowCount: 10 }),
      ),
    ];
    await rollupDay(DAY);
    expect(rollupFor("org_a")?.rowsRead).toBe(7);
  });
});

describe("A33 — a day that failed part-way is retried, not marked done", () => {
  it("heals org_b's day on a later night after its upsert failed mid-run", async () => {
    const days = ["2026-10-18", "2026-10-19", "2026-10-20"];
    db.audit = days.flatMap((d) => [
      brokerRead({ organizationId: "org_a", at: at(`${d}T09:00:00.000Z`) }),
      brokerRead({ organizationId: "org_b", clientTokenId: "tok_b", at: at(`${d}T10:00:00.000Z`), rowCount: 9 }),
    ]);

    // Night of 10-19: org_a's 10-18 row is written, then org_b's upsert throws.
    db.failUpsert = (org, day) => org === "org_b" && day.getTime() === DAY.getTime();
    await expect(runCoreEdgeUsageRollup(at("2026-10-19T03:00:00.000Z"))).rejects.toThrow("connection reset");
    db.failUpsert = null;

    // The nights that follow.
    await runCoreEdgeUsageRollup(at("2026-10-20T03:00:00.000Z"));
    await runCoreEdgeUsageRollup(at("2026-10-21T03:00:00.000Z"));

    expect(rollupFor("org_b"), "org_b's 10-18 usage must appear").toMatchObject({ calls: 1, rowsRead: 9 });
    expect(rollupFor("org_a")).toMatchObject({ calls: 1, rowsRead: 5 });
  });

  it("writes a day as all of its organizations or none", async () => {
    db.audit = [
      brokerRead({ organizationId: "org_a" }),
      brokerRead({ organizationId: "org_b", clientTokenId: "tok_b" }),
    ];
    db.failUpsert = (org) => org === "org_b";
    await expect(rollupDay(DAY)).rejects.toThrow();
    expect(rollupFor("org_a"), "a half-written day would read as covered").toBeUndefined();
  });
});
