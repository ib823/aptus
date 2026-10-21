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
 * Nor is anything backfilled at deploy, so no FIRST_CALL row predates it. An
 * app that has called for months and raises a request before its first call
 * after the deploy is told apart by the retained audit trail
 * (NorthboundAuditEvent), which the summary asks about exactly those journeys.
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
/** One organization per case below, so no case counts another's journeys. */
const CALLING_ORG = `${RUN}-calling`;
const FRESH_ORG = `${RUN}-fresh`;
const ORGS = [ORG, CALLING_ORG, FRESH_ORG];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date();
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function row(
  kind: string,
  at: Date,
  extra: { solutionId?: string; environment?: string; subjectId?: string; detail?: string },
  organizationId: string = ORG,
) {
  const scopeKey =
    kind === "FIRST_CALL"
      ? `call:${extra.solutionId}:${extra.environment}`
      : `grant:${extra.subjectId}`;
  return {
    organizationId,
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
    await prisma.organization.createMany({ data: ORGS.map((id) => ({ id, name: "Journey summary test", type: "client" })) });
  });

  afterAll(async () => {
    // Audit rows are append-only history with no foreign key: removed by hand.
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: { in: ORGS } } });
    // Cascades: journey events.
    await prisma.organization.deleteMany({ where: { id: { in: ORGS } } });
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

  it("does not count an app that was calling before the deploy as a new journey (request before its first post-deploy call)", async () => {
    const deployedAt = ago(5 * DAY);
    const audit = (at: Date) => ({
      organizationId: CALLING_ORG,
      solutionId: "nightly",
      interfaceId: "if-old",
      operation: "READ",
      externalId: "API_BUSINESS_PARTNER",
      environment: "PROD",
      status: 200,
      correlationId: `${RUN}-${at.getTime()}`,
      clientTokenId: "client-1",
      at,
    });
    // Months of nightly PROD reads, retained in the audit trail; none of them
    // is a journey milestone, because the table did not exist yet.
    await prisma.northboundAuditEvent.createMany({ data: [audit(ago(60 * DAY)), audit(ago(30 * DAY))] });
    await prisma.developerJourneyEvent.createMany({
      data: [
        // T0+1h: a renewal request; approved at T0+2h.
        row("GRANT_REQUESTED", new Date(deployedAt.getTime() + HOUR), { solutionId: "nightly", environment: "PROD", subjectId: "renew" }, CALLING_ORG),
        row("GRANT_DECIDED", new Date(deployedAt.getTime() + 2 * HOUR), { solutionId: "nightly", environment: "PROD", subjectId: "renew", detail: "APPROVED" }, CALLING_ORG),
        // T0+10h: the nightly batch's first call after the deploy.
        row("FIRST_CALL", new Date(deployedAt.getTime() + 10 * HOUR), { solutionId: "nightly", environment: "PROD", detail: "broker" }, CALLING_ORG),
      ],
    });

    const summary = await loadJourneySummary(CALLING_ORG, NOW);

    // Not a finished 9-hour journey: an app already calling a real system.
    expect(summary.ttfrc).toMatchObject({ excludedAlreadyCalling: 1, completed: 0, open: 0, stats: { n: 0 } });
  });

  it("measures an app whose only earlier audit rows are not successful calls on a real system", async () => {
    const start = ago(3 * DAY);
    await prisma.northboundAuditEvent.createMany({
      data: [
        // A refusal, a replay, a SANDBOX read and a discovery call: none is a real call.
        { organizationId: FRESH_ORG, solutionId: "fresh", interfaceId: "if-1", operation: "READ", externalId: "X", environment: "DEV", status: 403, correlationId: `${RUN}-f1`, at: ago(10 * DAY) },
        { organizationId: FRESH_ORG, solutionId: "fresh", interfaceId: "if-1", operation: "WRITE", externalId: "X", environment: "DEV", status: 201, replayed: true, correlationId: `${RUN}-f2`, at: ago(9 * DAY) },
        { organizationId: FRESH_ORG, solutionId: "fresh", interfaceId: "if-1", operation: "READ", externalId: "X", environment: "SANDBOX", status: 200, correlationId: `${RUN}-f3`, at: ago(8 * DAY) },
        { organizationId: FRESH_ORG, solutionId: "fresh", interfaceId: null, operation: "READ", externalId: "-discovery-", environment: "DEV", status: 200, correlationId: `${RUN}-f4`, at: ago(7 * DAY) },
        // Its first real call, after the request: the end of the journey, not a reason to exclude it.
        { organizationId: FRESH_ORG, solutionId: "fresh", interfaceId: "if-1", operation: "READ", externalId: "X", environment: "DEV", status: 200, correlationId: `${RUN}-f5`, at: new Date(start.getTime() + 2 * HOUR) },
      ],
    });
    await prisma.developerJourneyEvent.createMany({
      data: [
        row("GRANT_REQUESTED", start, { solutionId: "fresh", environment: "DEV", subjectId: "fresh-g" }, FRESH_ORG),
        row("GRANT_DECIDED", new Date(start.getTime() + HOUR), { solutionId: "fresh", environment: "DEV", subjectId: "fresh-g", detail: "APPROVED" }, FRESH_ORG),
        row("FIRST_CALL", new Date(start.getTime() + 2 * HOUR), { solutionId: "fresh", environment: "DEV", detail: "broker" }, FRESH_ORG),
      ],
    });

    const summary = await loadJourneySummary(FRESH_ORG, NOW);

    expect(summary.ttfrc).toMatchObject({ completed: 1, excludedAlreadyCalling: 0, stats: { n: 1 } });
  });
});
