// @vitest-environment node
/**
 * Recording the developer journey (P2.12): first occurrence only, never in the
 * way, and no database round trip added to the broker's hot path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ createMany: vi.fn(), findMany: vi.fn(), auditFindFirst: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    developerJourneyEvent: { createMany: db.createMany, findMany: db.findMany },
    northboundAuditEvent: { findFirst: db.auditFindFirst },
  },
}));

import {
  forgetRecordedJourneyMilestones,
  journeyRecordingEnabled,
  journeyScopeKey,
  loadJourneySummary,
  MAX_JOURNEY_ROWS,
  noteConnectionProbe,
  noteFirstCall,
  recordGrantDecided,
  recordJourneyEvent,
} from "@/lib/coreedge/journey";
import { isUnscopedByDesign, TENANT_ANCHORED_MODELS } from "@/lib/db/tenant-guard";

const call = {
  organizationId: "org-1",
  solutionId: "app-1",
  environment: "DEV",
  channel: "broker",
  status: 200,
} as const;

beforeEach(() => {
  db.createMany.mockReset().mockResolvedValue({ count: 1 });
  db.findMany.mockReset().mockResolvedValue([]);
  db.auditFindFirst.mockReset().mockResolvedValue(null);
  forgetRecordedJourneyMilestones();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("what a milestone is the first of", () => {
  it("builds one scope key per kind", () => {
    expect(journeyScopeKey("WORKSPACE_CREATED")).toBe("workspace");
    expect(journeyScopeKey("INTERFACE_REGISTERED", { solutionId: "s" })).toBe("solution:s");
    expect(journeyScopeKey("GRANT_REQUESTED", { subjectId: "g" })).toBe("grant:g");
    expect(journeyScopeKey("GRANT_DECIDED", { subjectId: "g" })).toBe("grant:g");
    expect(journeyScopeKey("KEY_ISSUED", { solutionId: "s", environment: "PROD" })).toBe("key:s:PROD");
    expect(journeyScopeKey("CONNECTION_SAVED", { subjectId: "c" })).toBe("connection:c");
    expect(journeyScopeKey("CONNECTION_PROBE_OK", { subjectId: "c" })).toBe("connection:c");
    expect(journeyScopeKey("FIRST_CALL", { solutionId: "s", environment: "TEST" })).toBe("call:s:TEST");
    expect(journeyScopeKey("FIRST_CALL", { solutionId: null, environment: "SANDBOX" })).toBe("call:console:SANDBOX");
  });
});

describe("recording", () => {
  it("inserts with ON CONFLICT DO NOTHING, so the first occurrence is kept", async () => {
    const at = new Date("2026-10-19T09:00:00Z");
    expect(
      await recordJourneyEvent({
        organizationId: "org-1",
        kind: "GRANT_REQUESTED",
        solutionId: "app-1",
        environment: "DEV",
        subjectId: "grant-1",
        actorUserId: "u-1",
        at,
      }),
    ).toBe(true);
    expect(db.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: "org-1",
          kind: "GRANT_REQUESTED",
          scopeKey: "grant:grant-1",
          solutionId: "app-1",
          environment: "DEV",
          subjectId: "grant-1",
          actorUserId: "u-1",
          detail: null,
          at,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("never throws: a failed write is logged and the caller carries on", async () => {
    db.createMany.mockRejectedValueOnce(new Error("relation does not exist"));
    await expect(recordJourneyEvent({ organizationId: "org-1", kind: "WORKSPACE_CREATED" })).resolves.toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it("stops entirely with COREEDGE_JOURNEY_EVENTS=off, and only with exactly that", async () => {
    expect(journeyRecordingEnabled({})).toBe(true);
    expect(journeyRecordingEnabled({ COREEDGE_JOURNEY_EVENTS: "on" })).toBe(true);
    expect(journeyRecordingEnabled({ COREEDGE_JOURNEY_EVENTS: "of" })).toBe(true);
    expect(journeyRecordingEnabled({ COREEDGE_JOURNEY_EVENTS: " OFF " })).toBe(false);

    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    expect(await recordJourneyEvent({ organizationId: "org-1", kind: "WORKSPACE_CREATED" })).toBe(false);
    await noteFirstCall(call);
    expect(db.createMany).not.toHaveBeenCalled();
  });

  it("drops an environment it does not know, and never records the deployment sentinel", async () => {
    await recordJourneyEvent({ organizationId: "org-1", kind: "CONNECTION_SAVED", subjectId: "c", environment: "deployment:hub" });
    expect(db.createMany.mock.calls[0]![0].data[0].environment).toBeNull();
    await recordJourneyEvent({ organizationId: "-deployment-", kind: "WORKSPACE_CREATED" });
    expect(db.createMany).toHaveBeenCalledTimes(1);
  });

  it("records a decision at the instant written on the grant", async () => {
    const decidedAt = new Date("2026-10-19T11:00:00Z");
    await recordGrantDecided({
      grant: { id: "g", organizationId: "org-1", solutionId: "app-1", environment: "TEST" },
      decision: "READ_ONLY",
      decidedAt,
      deciderId: "approver",
    });
    expect(db.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      kind: "GRANT_DECIDED",
      scopeKey: "grant:g",
      detail: "READ_ONLY",
      actorUserId: "approver",
      at: decidedAt,
    });
  });
});

describe("the hot path's cheap guard", () => {
  it("adds no database round trip after this instance's first call", async () => {
    await noteFirstCall(call);
    expect(db.createMany).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 100; i++) await noteFirstCall(call);
    expect(db.createMany).toHaveBeenCalledTimes(1);

    // Another (app, environment) is another first call.
    await noteFirstCall({ ...call, environment: "PROD" });
    expect(db.createMany).toHaveBeenCalledTimes(2);
  });

  it("is concurrency-safe inside one instance", async () => {
    await Promise.all(Array.from({ length: 20 }, () => noteFirstCall(call)));
    expect(db.createMany).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed write rather than forgetting the milestone", async () => {
    db.createMany.mockRejectedValueOnce(new Error("connection reset"));
    await noteFirstCall(call);
    await noteFirstCall(call);
    expect(db.createMany).toHaveBeenCalledTimes(2);
    await noteFirstCall(call);
    expect(db.createMany).toHaveBeenCalledTimes(2);
  });

  it("records only success: a refusal, an error or an unknown environment is not a first call", async () => {
    await noteFirstCall({ ...call, status: 403 });
    await noteFirstCall({ ...call, status: 502 });
    await noteFirstCall({ ...call, environment: null });
    expect(db.createMany).not.toHaveBeenCalled();
    await noteFirstCall({ ...call, status: 201 });
    expect(db.createMany.mock.calls[0]![0].data[0]).toMatchObject({ kind: "FIRST_CALL", scopeKey: "call:app-1:DEV", detail: "broker" });
  });

  it("records a connection's first OK probe, once per instance, and nothing else", async () => {
    const probe = { organizationId: "org-1", connectionId: "c1", environment: "DEV" };
    await noteConnectionProbe({ ...probe, status: "UNAUTHORIZED" });
    expect(db.createMany).not.toHaveBeenCalled();
    await noteConnectionProbe({ ...probe, status: "OK" });
    await noteConnectionProbe({ ...probe, status: "OK" });
    expect(db.createMany).toHaveBeenCalledTimes(1);
    expect(db.createMany.mock.calls[0]![0].data[0]).toMatchObject({ kind: "CONNECTION_PROBE_OK", scopeKey: "connection:c1" });
  });
});

describe("reading", () => {
  it("scopes to one organization, or reads all only when asked to", async () => {
    await loadJourneySummary("org-1", new Date("2026-10-21T12:00:00Z"));
    const scoped = db.findMany.mock.calls.map((c) => c[0]);
    expect(scoped).toHaveLength(2);
    for (const args of scoped) expect(args.where).toMatchObject({ organizationId: "org-1" });
    db.findMany.mockClear();
    await loadJourneySummary(null, new Date("2026-10-21T12:00:00Z"));
    const all = db.findMany.mock.calls.map((c) => c[0]);
    expect(all).toHaveLength(2);
    for (const args of all) {
      expect(args.where).not.toHaveProperty("organizationId");
      expect(args.take).toBe(MAX_JOURNEY_ROWS + 1);
    }
  });

  it("reads the window, and first calls from before it whatever their age", async () => {
    const now = new Date("2026-10-21T12:00:00Z");
    await loadJourneySummary("org-1", now);
    const readFrom = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    expect(db.findMany.mock.calls.map((c) => c[0].where)).toEqual(
      expect.arrayContaining([
        { organizationId: "org-1", at: { gte: readFrom } },
        { organizationId: "org-1", kind: "FIRST_CALL", at: { lt: readFrom } },
      ]),
    );
  });

  it("says so when the row cap cut the window short", async () => {
    // The window read (not the read of earlier first calls) comes back full.
    db.findMany.mockImplementation(async (args: { where: { kind?: string } }) =>
      args.where.kind === "FIRST_CALL" ? [] : Array.from({ length: MAX_JOURNEY_ROWS + 1 }, (_, i) => ({
        organizationId: "org-1",
        kind: "INTERFACE_REGISTERED",
        scopeKey: `solution:${i}`,
        solutionId: String(i),
        environment: null,
        subjectId: null,
        detail: null,
        at: new Date("2026-10-20T00:00:00Z"),
      })),
    );
    const summary = await loadJourneySummary("org-1", new Date("2026-10-21T12:00:00Z"));
    expect(summary.truncated).toBe(true);
  });
});

describe("an app already calling before the deploy", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const requested = new Date("2026-10-19T09:00:00Z");
  const journeyRows = [
    { organizationId: "org-1", kind: "GRANT_REQUESTED", scopeKey: "grant:g1", solutionId: "app-1", environment: "PROD", subjectId: "g1", detail: null, at: requested },
    { organizationId: "org-1", kind: "GRANT_DECIDED", scopeKey: "grant:g1", solutionId: "app-1", environment: "PROD", subjectId: "g1", detail: "APPROVED", at: new Date("2026-10-19T10:00:00Z") },
    { organizationId: "org-1", kind: "FIRST_CALL", scopeKey: "call:app-1:PROD", solutionId: "app-1", environment: "PROD", subjectId: null, detail: "broker", at: new Date("2026-10-19T18:00:00Z") },
  ];

  beforeEach(() => {
    db.findMany.mockImplementation(async (args: { where: { kind?: string } }) => (args.where.kind === "FIRST_CALL" ? [] : journeyRows));
  });

  it("asks the audit trail, scoped to the app's organization, for a successful real call before the request", async () => {
    await loadJourneySummary(null, now);
    expect(db.auditFindFirst).toHaveBeenCalledTimes(1);
    const where = db.auditFindFirst.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      organizationId: "org-1",
      solutionId: "app-1",
      at: { lt: requested },
      status: { gte: 200, lt: 300 },
      replayed: false,
      interfaceId: { not: null },
    });
    expect(isUnscopedByDesign("NorthboundAuditEvent", "findFirst", { where })).toBe(false);
  });

  it("excludes the journey when the audit trail has one", async () => {
    db.auditFindFirst.mockResolvedValue({ at: new Date("2026-08-01T02:00:00Z") });
    const summary = await loadJourneySummary("org-1", now);
    expect(summary.ttfrc).toMatchObject({ excludedAlreadyCalling: 1, completed: 0 });
  });

  it("measures it from the milestones when the audit read fails", async () => {
    db.auditFindFirst.mockRejectedValue(new Error("connection reset"));
    const summary = await loadJourneySummary("org-1", now);
    expect(summary.ttfrc).toMatchObject({ excludedAlreadyCalling: 0, completed: 1 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("audit lookup failed"), expect.anything());
  });

  it("does not ask about a journey a recorded first call already excludes", async () => {
    db.findMany.mockImplementation(async (args: { where: { kind?: string } }) =>
      args.where.kind === "FIRST_CALL"
        ? [{ ...journeyRows[2]!, scopeKey: "call:app-1:DEV", environment: "DEV", at: new Date("2026-01-01T00:00:00Z") }]
        : journeyRows,
    );
    const summary = await loadJourneySummary("org-1", now);
    expect(db.auditFindFirst).not.toHaveBeenCalled();
    expect(summary.ttfrc.excludedAlreadyCalling).toBe(1);
  });
});

describe("tenant guard (definition of done)", () => {
  it("anchors the table to its organization, with no unscoped lookup by design", () => {
    expect(TENANT_ANCHORED_MODELS as readonly string[]).toContain("DeveloperJourneyEvent");
    expect(isUnscopedByDesign("DeveloperJourneyEvent", "findMany", { where: { at: { gte: new Date() } } })).toBe(false);
    expect(isUnscopedByDesign("DeveloperJourneyEvent", "findUnique", { where: { id: "x" } })).toBe(false);
  });
});
