/**
 * The reference a lane page quotes is the lane's own last data call (audit A67).
 *
 * `lastLaneCall` read the newest 50 rows for the FEED, across every
 * environment, and kept the first whose environment matched the lane. A feed
 * holds one credential per environment, so 50 SANDBOX calls after a PROD
 * failure pushed every PROD row off the page: the PROD lane said "No call has
 * been recorded for this lane" and the operator had no correlation id for the
 * failure they were looking at. The same page also held `-schema-` rows, so the
 * reference on a failing lane could be the app's later, successful schema fetch.
 *
 * The audit table is held in memory and the function's own `where` is evaluated
 * against it, so the assertion is about what the database would return.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  organizationId: string;
  solutionId: string;
  interfaceId: string;
  environment: string;
  externalId: string;
  dryRun: boolean;
  status: number;
  correlationId: string;
  at: Date;
}

const db = vi.hoisted(() => ({ rows: [] as unknown[] }));

/** One column against one Prisma filter. Unknown operators fail loudly. */
function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object") return value === cond;
  const c = cond as { equals?: string; mode?: string; not?: unknown };
  for (const op of Object.keys(c)) {
    if (!["equals", "mode", "not"].includes(op)) throw new Error(`unsupported filter ${op}`);
  }
  if ("not" in c && value === c.not) return false;
  if (c.equals !== undefined) {
    return c.mode === "insensitive"
      ? String(value).toLowerCase() === c.equals.toLowerCase()
      : value === c.equals;
  }
  return true;
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Array<Record<string, unknown>>).some((w) => matches(row, w));
    return matchField(row[key as keyof Row], cond);
  });
}

function query(args: { where: Record<string, unknown>; take?: number }): Row[] {
  const found = (db.rows as Row[])
    .filter((r) => matches(r, args.where))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  return args.take === undefined ? found : found.slice(0, args.take);
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: {
      findMany: (args: { where: Record<string, unknown>; take?: number }) => Promise.resolve(query(args)),
      findFirst: (args: { where: Record<string, unknown> }) => Promise.resolve(query(args)[0] ?? null),
    },
  },
}));

import { LANE_ENVIRONMENTS, laneEnvironmentAliases, parseLaneEnvironment } from "@/lib/coreedge/lanes";
import { lastLaneCall } from "@/lib/coreedge/queries";

describe("laneEnvironmentAliases", () => {
  it("is the parser's exact inverse, so the SQL match selects what the parser accepts", () => {
    for (const environment of LANE_ENVIRONMENTS) {
      const aliases = laneEnvironmentAliases(environment);
      expect(aliases).toContain(environment);
      for (const alias of aliases) expect(parseLaneEnvironment(alias)).toBe(environment);
    }
    expect(laneEnvironmentAliases("PROD")).toEqual(expect.arrayContaining(["PRD", "PRODUCTION"]));
  });
});

const call = (over: Partial<Row>): Row => ({
  organizationId: "org_a",
  solutionId: "sol_1",
  interfaceId: "if_1",
  environment: "PROD",
  externalId: "API_BUSINESS_PARTNER",
  dryRun: false,
  status: 200,
  correlationId: "c",
  at: new Date("2026-10-19T11:00:00.000Z"),
  ...over,
});

beforeEach(() => {
  db.rows = [];
});

describe("lastLaneCall", () => {
  it("finds the PROD failure after 50 SANDBOX calls on the same feed", async () => {
    db.rows = [
      call({ environment: "PROD", status: 502, correlationId: "corr-prod-502", at: new Date("2026-10-19T11:59:00.000Z") }),
      ...Array.from({ length: 50 }, (_, i) =>
        call({
          environment: "SANDBOX",
          correlationId: `corr-sbx-${i}`,
          at: new Date(Date.UTC(2026, 9, 19, 12, 0, i)),
        }),
      ),
    ];

    const last = await lastLaneCall("org_a", "sol_1", "if_1", "PROD");
    expect(last, "the PROD lane was called, and its reference must be quotable").not.toBeNull();
    expect(last).toMatchObject({ correlationId: "corr-prod-502", status: 502 });
  });

  it("matches every spelling the lane parser accepts, case-insensitively", async () => {
    db.rows = [call({ environment: "prd", correlationId: "corr-legacy" })];
    expect((await lastLaneCall("org_a", "sol_1", "if_1", "PROD"))?.correlationId).toBe("corr-legacy");
    expect(await lastLaneCall("org_a", "sol_1", "if_1", "TEST")).toBeNull();
  });

  it("quotes the failing data call, not the app's later schema fetch", async () => {
    db.rows = [
      call({ status: 502, correlationId: "corr-data-502", at: new Date("2026-10-19T11:59:00.000Z") }),
      call({ externalId: "-schema-", status: 200, correlationId: "corr-schema", at: new Date("2026-10-19T12:01:00.000Z") }),
    ];
    expect((await lastLaneCall("org_a", "sol_1", "if_1", "PROD"))?.correlationId).toBe("corr-data-502");
  });

  it("still never quotes a dry run", async () => {
    db.rows = [call({ dryRun: true, correlationId: "corr-rehearsal" })];
    expect(await lastLaneCall("org_a", "sol_1", "if_1", "PROD")).toBeNull();
  });
});
