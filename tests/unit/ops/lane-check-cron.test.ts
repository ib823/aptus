/**
 * GET /api/cron/lane-checks — the route that makes the ledger real.
 *
 * WHY THIS FILE EXISTS AT ALL. `sweepLaneChecks` shipped with unit tests on its
 * pure helper and no caller anywhere in the repo, so nothing failed while the
 * ledger stayed empty in production and every lane rendered "never checked".
 * A test on the sweep's arithmetic cannot catch that. These two can:
 *
 * 1. THE SECRET GATE. A cron that probes every tenant's SAP systems and writes
 *    per-lane rows must refuse an unauthenticated caller — including when
 *    CRON_SECRET is unset, where an "allow if unconfigured" reading would turn
 *    this into an open fleet-wide probe endpoint.
 *
 * 2. THE TWO WRITES. One successful run must leave BOTH the LaneCheck rows the
 *    console joins against AND the CronRunLog row the jobs strip reads. Either
 *    one alone is a silent failure: ledger with no log means "did it run?" has
 *    no answer; log with no ledger means the strip says green while every lane
 *    still says never checked.
 */

import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Type-only, so it is erased before vi.mock hoisting and never loads the module.
import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";
import type * as ConnectionHealthModule from "@/lib/studio/connection-health";

const mocks = vi.hoisted(() => ({
  findSolutions: vi.fn(),
  findConnections: vi.fn(),
  upsertLaneCheck: vi.fn(),
  upsertServiceHealth: vi.fn(),
  createCronRunLog: vi.fn(),
  resolveSapConnections: vi.fn(),
  probeConnection: vi.fn(),
  readEntitySet: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findMany: mocks.findSolutions },
    sapConnection: { findMany: mocks.findConnections },
    laneCheck: { upsert: mocks.upsertLaneCheck },
    sapServiceHealth: { upsert: mocks.upsertServiceHealth },
    cronRunLog: { create: mocks.createCronRunLog },
  },
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionResolverModule>()),
  resolveSapConnections: mocks.resolveSapConnections,
}));
vi.mock("@/lib/studio/connection-health", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionHealthModule>()),
  probeConnection: mocks.probeConnection,
}));
vi.mock("@/lib/northbound/read", () => ({ readEntitySet: mocks.readEntitySet }));

import { GET } from "@/app/api/cron/lane-checks/route";

const SECRET = "test-cron-secret-value";

/** One ACTIVE app with one feed that has an entity set — a checkable lane. */
const SOLUTION = {
  id: "sol_1",
  organizationId: "org_a",
  interfaces: [
    { id: "if_1", sapProduct: "s4hana", externalId: "API_BUSINESS_PARTNER", entitySet: "A_BusinessPartner" },
  ],
};

/** DEV only, so the fixture yields exactly one lane rather than four. */
const CONNECTION_ROW = { id: "conn_1", organizationId: "org_a", environment: "DEV" };

const RESOLVED = {
  id: "conn_1",
  key: "acme-dev",
  product: "s4hana",
  environment: "DEV",
  baseUrl: "https://sap.example",
  apiPath: "/sap/opu/odata/sap/API_BUSINESS_PARTNER",
  secrets: {},
};

const call = (headers: Record<string, string>) =>
  GET(new Request("http://localhost/api/cron/lane-checks", { headers }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  mocks.findSolutions.mockResolvedValue([SOLUTION]);
  mocks.findConnections.mockResolvedValue([CONNECTION_ROW]);
  mocks.resolveSapConnections.mockResolvedValue([RESOLVED]);
  mocks.probeConnection.mockResolvedValue({ status: "OK", httpStatus: 200, detail: "", durationMs: 9 });
  mocks.readEntitySet.mockResolvedValue({ status: "OK", httpStatus: 200, records: [{ id: 1 }] });
  mocks.upsertLaneCheck.mockResolvedValue({});
  mocks.upsertServiceHealth.mockResolvedValue({});
  mocks.createCronRunLog.mockResolvedValue({});
});

describe("the secret gate", () => {
  it("refuses a caller with no authorization header", async () => {
    const res = await call({});
    expect(res.status).toBe(401);
    expect(mocks.upsertLaneCheck).not.toHaveBeenCalled();
  });

  it("refuses a caller with the wrong secret", async () => {
    const res = await call({ authorization: "Bearer not-the-secret-at-all" });
    expect(res.status).toBe(401);
    expect(mocks.upsertLaneCheck).not.toHaveBeenCalled();
  });

  it("refuses EVERYONE when CRON_SECRET is unset, rather than running open", async () => {
    // The failure mode worth a test of its own: an unconfigured deployment must
    // not turn a fleet-wide SAP probe into an unauthenticated endpoint.
    vi.stubEnv("CRON_SECRET", "");
    expect((await call({ authorization: "Bearer " })).status).toBe(401);
    expect((await call({})).status).toBe(401);
    expect(mocks.upsertLaneCheck).not.toHaveBeenCalled();
  });

  it("does not record a CronRunLog row for a refused call", async () => {
    // A refusal is not a run. Logging it would put "ok" rows in the jobs strip
    // for sweeps that never touched a lane.
    await call({});
    expect(mocks.createCronRunLog).not.toHaveBeenCalled();
  });
});

describe("a successful sweep writes the ledger AND the run log", () => {
  it("upserts the LaneCheck row the console joins against", async () => {
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);

    expect(mocks.upsertLaneCheck).toHaveBeenCalledTimes(1);
    const arg = mocks.upsertLaneCheck.mock.calls[0]?.[0];
    expect(arg.where.solutionId_interfaceId_environment).toEqual({
      solutionId: "sol_1",
      interfaceId: "if_1",
      environment: "DEV",
    });
    // Both outcomes, never merged — the whole reason the ledger has two columns.
    expect(arg.create.probeStatus).toBe("OK");
    expect(arg.create.readStatus).toBe("OK");
    expect(arg.create.readRowCount).toBe(1);
    expect(arg.create.probeAt).toBeInstanceOf(Date);
    expect(arg.create.readAt).toBeInstanceOf(Date);
  });

  it("records the CronRunLog row under the job name vercel.json schedules", async () => {
    await call({ authorization: `Bearer ${SECRET}` });

    expect(mocks.createCronRunLog).toHaveBeenCalledTimes(1);
    const { data } = mocks.createCronRunLog.mock.calls[0]?.[0] ?? {};
    expect(data.job).toBe("lane-checks");
    expect(data.ok).toBe(true);
    expect(data.summaryJson.checked).toBe(1);
    // The skipped counts are part of the outcome: a run that checked nothing
    // because no lane had a connection reads differently from a broken one.
    expect(data.summaryJson).toHaveProperty("skippedNoConnection");
    expect(data.summaryJson).toHaveProperty("skippedNoEntitySet");
    expect(data.summaryJson.byReadStatus).toEqual({ OK: 1 });
  });

  it("writes the per-service matrix too, so the SAP systems screen has rows", async () => {
    await call({ authorization: `Bearer ${SECRET}` });
    expect(mocks.upsertServiceHealth).toHaveBeenCalledTimes(1);
  });
});

describe("a failing sweep is recorded as a failure, not swallowed", () => {
  it("returns 500 and writes ok:false rather than leaving the strip silent", async () => {
    mocks.findSolutions.mockRejectedValue(new Error("database is on fire"));

    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(500);

    const { data } = mocks.createCronRunLog.mock.calls[0]?.[0] ?? {};
    expect(data.job).toBe("lane-checks");
    expect(data.ok).toBe(false);
    expect(data.summaryJson.error).toContain("database is on fire");
  });
});

describe("the schedule is real, not just a comment", () => {
  /*
   * THE ASSERTIONS THAT WOULD HAVE CAUGHT THE ORIGINAL BUG. PR-6a's sweep was
   * described as "scheduled" in two headers while vercel.json never named it,
   * and nothing in the repo could tell. A route with no schedule is the same
   * silence as a function with no caller, so the schedule is read from the file
   * that actually decides it rather than asserted about in prose.
   */
  interface CronEntry {
    readonly path: string;
    readonly schedule: string;
  }

  const crons = (): readonly CronEntry[] => {
    const raw = readFileSync("vercel.json", "utf8");
    return (JSON.parse(raw) as { crons: CronEntry[] }).crons;
  };

  /** Minutes past midnight UTC, from the cron expression's first two fields. */
  const minutesUtc = (entry: CronEntry): number => {
    const [minute, hour] = entry.schedule.split(" ");
    return Number(hour) * 60 + Number(minute);
  };

  const entry = (path: string): CronEntry => {
    const found = crons().find((c) => c.path === path);
    if (!found) throw new Error(`${path} is not scheduled in vercel.json`);
    return found;
  };

  it("registers /api/cron/lane-checks in vercel.json", () => {
    expect(() => entry("/api/cron/lane-checks")).not.toThrow();
  });

  it("runs it after the connection sweep, with room for that sweep to run long", () => {
    /*
     * ORDER: a lane read through a connection that went dark overnight should be
     * recorded against a connection already known to be failing.
     * GAP: maxDuration is 300s on both routes, so anything under five minutes
     * could overlap with a connection sweep that runs to its ceiling.
     */
    const gap = minutesUtc(entry("/api/cron/lane-checks")) - minutesUtc(entry("/api/cron/connection-probes"));
    expect(gap).toBeGreaterThanOrEqual(5);
  });

  it("does not collide with any other scheduled job", () => {
    // Two jobs at the same minute contend for the same cold starts and the same
    // database, and the retention job already sits in this window.
    const lane = minutesUtc(entry("/api/cron/lane-checks"));
    const others = crons()
      .filter((c) => c.path !== "/api/cron/lane-checks")
      .map(minutesUtc);
    expect(others).not.toContain(lane);
  });
});
