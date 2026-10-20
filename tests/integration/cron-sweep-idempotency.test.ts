// @vitest-environment node
/**
 * The sweeps themselves are safe to run twice at once (P0.18).
 *
 * The job lease stops a duplicate DELIVERY. It cannot stop every overlap: a run
 * that outlives its lease (a hung statement past the TTL) shares the job with
 * the run that took the lease over. So each sweep that was not already
 * idempotent is made so, and proved here against a real database by running it
 * twice concurrently with no lease at all.
 *
 * Already idempotent, and why (not re-proved here):
 * - northbound-reap and northbound-retention delete by a predicate re-checked
 *   at deletion time; a second run finds nothing left to delete.
 * - analytics and lane-checks upsert on unique keys; a second run writes the
 *   same values.
 * - the coreedge-usage rollup writes each day in one transaction that makes
 *   the day match its audit rows.
 *
 * Made idempotent here:
 * - trials: one conditional UPDATE. The scan-then-update form counted every
 *   expiry once per overlapping run.
 * - connection-probes: the status write is a compare-and-set, so one drift
 *   alert goes out per break however many sweeps observe it.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  resolveSapConnections: vi.fn(),
  probeConnection: vi.fn(),
  sendEmail: vi.fn(),
  captureMessage: vi.fn(),
}));

/**
 * Holds every organization scan's result until `expected` scans have read, so
 * overlapping runs all scan before any of them writes: the interleaving a
 * scan-then-update sweep gets wrong, made certain rather than left to timing.
 * Released after a short wait regardless, so a sweep that scans less often
 * than expected (or not at all) is never stuck behind it.
 */
const scanGate = vi.hoisted(() => {
  const state = { expected: 0, arrived: 0, open: () => {}, opened: Promise.resolve() };
  return {
    arm(expected: number) {
      state.expected = expected;
      state.arrived = 0;
      state.opened = new Promise<void>((resolve) => {
        state.open = resolve;
        setTimeout(resolve, 2_000);
      });
    },
    disarm() {
      state.expected = 0;
      state.open();
    },
    async pass(): Promise<void> {
      if (state.expected === 0) return;
      state.arrived += 1;
      if (state.arrived >= state.expected) state.open();
      await state.opened;
    },
  };
});

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  const gated = base.$extends({
    query: {
      organization: {
        async findMany({ args, query }) {
          // Held AFTER the read, not before: released together, the reads would
          // still queue for pooled connections behind the first run's update.
          const rows = await query(args);
          await scanGate.pass();
          return rows;
        },
      },
    },
  });
  return { prisma: gated.$extends(tenantScopeGuard()) };
});
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ResolverModule>()),
  resolveSapConnections: mocks.resolveSapConnections,
}));
vi.mock("@/lib/studio/connection-health", () => ({
  probeConnection: mocks.probeConnection,
  resolveProbePath: () => "/sap/opu/odata/sap/API_BUSINESS_PARTNER",
}));
vi.mock("@/lib/email/brevo", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: mocks.captureMessage }));

import { prisma } from "@/lib/db/prisma";
import { checkAndExpireTrials } from "@/lib/commercial/trial-manager";
import { sweepConnectionProbes } from "@/lib/ops/connection-probe-sweep";
import { forgetRecordedJourneyMilestones } from "@/lib/coreedge/journey";

// Opt in explicitly; never fall back to an application's DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("cron sweeps run twice at once, with no lease", () => {
  const run = randomUUID().slice(0, 8);
  const orgIds: string[] = [];

  async function org(data: { subscriptionStatus: string; trialEndsAt: Date | null }): Promise<string> {
    const created = await prisma.organization.create({
      data: { name: `Sweep idempotency ${run}`, type: "client", ...data },
      select: { id: true },
    });
    orgIds.push(created.id);
    return created.id;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    for (const organizationId of orgIds) {
      await prisma.sapConnectionProbeEvent.deleteMany({ where: { organizationId } });
      await prisma.sapConnection.deleteMany({ where: { organizationId } });
    }
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.$disconnect();
  });

  describe("trials", () => {
    it("expires each lapsed trial once, counted once, however many runs overlap", async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lapsed = [
        await org({ subscriptionStatus: "TRIALING", trialEndsAt: past }),
        await org({ subscriptionStatus: "TRIALING", trialEndsAt: past }),
        await org({ subscriptionStatus: "TRIALING", trialEndsAt: past }),
      ];
      const running = await org({ subscriptionStatus: "TRIALING", trialEndsAt: new Date(now.getTime() + 86_400_000) });
      const paid = await org({ subscriptionStatus: "ACTIVE", trialEndsAt: past });

      // Everything due in this database, ours included — the sweep is fleet-wide.
      const due = await prisma.organization.count({
        where: { subscriptionStatus: "TRIALING", trialEndsAt: { lte: now } },
      });

      const overlapping = 6;
      scanGate.arm(overlapping);
      let counts: number[];
      try {
        counts = await Promise.all(Array.from({ length: overlapping }, () => checkAndExpireTrials(now)));
      } finally {
        scanGate.disarm();
      }
      // The scan-then-update form reported every expiry once per overlapping run.
      expect(counts.reduce((a, b) => a + b, 0)).toBe(due);

      const after = await prisma.organization.findMany({
        where: { id: { in: [...lapsed, running, paid] } },
        select: { id: true, subscriptionStatus: true },
      });
      const status = new Map(after.map((o) => [o.id, o.subscriptionStatus]));
      for (const id of lapsed) expect(status.get(id)).toBe("TRIAL_EXPIRED");
      expect(status.get(running)).toBe("TRIALING");
      expect(status.get(paid)).toBe("ACTIVE");

      // And a run after them finds nothing left to do.
      expect(await checkAndExpireTrials(now)).toBe(0);
    });
  });

  describe("connection-probes", () => {
    it("sends one drift alert for one break, however many sweeps observe it", async () => {
      const organizationId = await org({ subscriptionStatus: "ACTIVE", trialEndsAt: null });
      const key = `sweep-${run}`;
      const connection = await prisma.sapConnection.create({
        data: {
          organizationId,
          product: "s4hana",
          key,
          label: "Acme S/4 DEV",
          baseUrl: "https://sap.example",
          authType: "basic",
          secretsCiphertext: "sealed",
          environment: "DEV",
          isActive: true,
          lastValidationStatus: "OK",
        },
        select: { id: true },
      });

      // Other tests' connections may share this database; only ours resolves.
      mocks.resolveSapConnections.mockImplementation(async (org: string) =>
        org === organizationId ? [{ id: connection.id, key }] : [],
      );
      // Both sweeps read OK at their start, then both probe a failing system.
      // The probe answers only once both are inside it, so the two status writes
      // genuinely race rather than happening to run one after the other.
      let arrived = 0;
      let bothIn!: () => void;
      const together = new Promise<void>((resolve) => {
        bothIn = resolve;
      });
      mocks.probeConnection.mockImplementation(async () => {
        arrived += 1;
        if (arrived === 2) bothIn();
        await together;
        return { status: "UNAUTHORIZED", httpStatus: 401, detail: "Refused", durationMs: 5 };
      });

      const [a, b] = await Promise.all([sweepConnectionProbes(), sweepConnectionProbes()]);

      expect(a.transitions.length + b.transitions.length).toBe(1);
      expect(mocks.captureMessage).toHaveBeenCalledTimes(1);

      // Both observations are still recorded — each was a real probe.
      expect(
        await prisma.sapConnectionProbeEvent.count({ where: { organizationId, connectionId: connection.id } }),
      ).toBe(2);
      const stored = await prisma.sapConnection.findFirst({
        where: { id: connection.id, organizationId },
        select: { lastValidationStatus: true },
      });
      expect(stored?.lastValidationStatus).toBe("UNAUTHORIZED");
    });

    it("records a connection's first good probe once, however many sweeps and instances see it (P2.12)", async () => {
      const organizationId = await org({ subscriptionStatus: "ACTIVE", trialEndsAt: null });
      const key = `journey-${run}`;
      const connection = await prisma.sapConnection.create({
        data: {
          organizationId,
          product: "s4hana",
          key,
          label: "Acme S/4 TEST",
          baseUrl: "https://sap.example",
          authType: "basic",
          secretsCiphertext: "sealed",
          environment: "TEST",
          isActive: true,
          lastValidationStatus: "UNAUTHORIZED",
        },
        select: { id: true },
      });
      mocks.resolveSapConnections.mockImplementation(async (o: string) => (o === organizationId ? [{ id: connection.id, key }] : []));
      mocks.probeConnection.mockResolvedValue({ status: "OK", httpStatus: 200, detail: "OK", durationMs: 5 });

      await Promise.all([sweepConnectionProbes(), sweepConnectionProbes()]);
      const first = await prisma.developerJourneyEvent.findMany({ where: { organizationId, kind: "CONNECTION_PROBE_OK" } });
      // A fresh instance remembers nothing; the table still keeps the first.
      forgetRecordedJourneyMilestones();
      await sweepConnectionProbes();
      const after = await prisma.developerJourneyEvent.findMany({ where: { organizationId, kind: "CONNECTION_PROBE_OK" } });

      expect(first).toEqual([
        expect.objectContaining({ scopeKey: `connection:${connection.id}`, subjectId: connection.id, environment: "TEST" }),
      ]);
      expect(after).toHaveLength(1);
      expect(after[0]!.at.getTime()).toBe(first[0]!.at.getTime());
    });
  });
});
