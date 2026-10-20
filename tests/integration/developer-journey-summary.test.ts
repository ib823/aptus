// @vitest-environment node
/**
 * P2.12 reading the journey back, against real PostgreSQL: what
 * `loadJourneySummary` reads decides what the pure computation can see.
 *
 * FIRST_CALL rows are first occurrences: one per (app, environment), written
 * once and never again. So the "already calling a real system" exclusion must
 * see an app's first call however old it is. A read window that also bounds
 * those rows would forget, after 180 days, that a long-running app is already
 * calling, and count its next request as a journey stuck "waiting on the
 * developer" for up to 90 days.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { JOURNEY_LOOKBACK_DAYS, JOURNEY_WINDOW_DAYS, loadJourneySummary } from "@/lib/coreedge/journey";

const RUN = `p212s-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date();
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function row(kind: string, at: Date, extra: { solutionId?: string; environment?: string; subjectId?: string; detail?: string }) {
  const scopeKey =
    kind === "FIRST_CALL"
      ? `call:${extra.solutionId}:${extra.environment}`
      : `grant:${extra.subjectId}`;
  return {
    organizationId: ORG,
    kind,
    scopeKey,
    solutionId: extra.solutionId ?? null,
    environment: extra.environment ?? null,
    subjectId: extra.subjectId ?? null,
    detail: extra.detail ?? null,
    at,
  };
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("loading the journey summary (P2.12)", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Journey summary test", type: "client" } });
  });

  afterAll(async () => {
    // Cascades: journey events.
    await prisma.organization.delete({ where: { id: ORG } });
  });

  it("still sees an app's first real call when it is older than the read window", async () => {
    const readWindowDays = JOURNEY_WINDOW_DAYS + JOURNEY_LOOKBACK_DAYS;
    await prisma.developerJourneyEvent.createMany({
      data: [
        // Long ago: the app asked for DEV, was approved and has called DEV ever since.
        row("GRANT_REQUESTED", ago((readWindowDays + 20) * DAY), { solutionId: "sol", environment: "DEV", subjectId: "g1" }),
        row("GRANT_DECIDED", ago((readWindowDays + 19) * DAY), { solutionId: "sol", environment: "DEV", subjectId: "g1", detail: "APPROVED" }),
        row("FIRST_CALL", ago((readWindowDays + 18) * DAY), { solutionId: "sol", environment: "DEV", detail: "broker" }),
        // Now: a second DEV request (another interface), decided within the hour.
        row("GRANT_REQUESTED", ago(20 * DAY), { solutionId: "sol", environment: "DEV", subjectId: "g2" }),
        row("GRANT_DECIDED", ago(20 * DAY - HOUR), { solutionId: "sol", environment: "DEV", subjectId: "g2", detail: "APPROVED" }),
      ],
    });

    const summary = await loadJourneySummary(ORG, NOW);

    expect(summary.ttfrc).toMatchObject({
      excludedAlreadyCalling: 1,
      open: 0,
      completed: 0,
      openWaitingOn: { approver: 0, sapSetup: 0, developer: 0 },
      stats: { n: 0 },
    });
    // The old call is not a milestone of this window.
    expect(summary.funnel.find((f) => f.step === "FIRST_CALL")?.organizations).toBe(0);
    expect(summary.truncated).toBe(false);
  });
});
