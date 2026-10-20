// @vitest-environment node
/**
 * Recording the developer journey (P2.12): first occurrence only, never in the
 * way, and no database round trip added to the broker's hot path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ createMany: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { developerJourneyEvent: { createMany: db.createMany, findMany: db.findMany } },
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
    expect(db.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1" });
    await loadJourneySummary(null, new Date("2026-10-21T12:00:00Z"));
    expect(db.findMany.mock.calls[1]![0].where).not.toHaveProperty("organizationId");
    expect(db.findMany.mock.calls[1]![0].take).toBe(MAX_JOURNEY_ROWS + 1);
  });

  it("says so when the row cap cut the window short", async () => {
    db.findMany.mockResolvedValueOnce(
      Array.from({ length: MAX_JOURNEY_ROWS + 1 }, (_, i) => ({
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

describe("tenant guard (definition of done)", () => {
  it("anchors the table to its organization, with no unscoped lookup by design", () => {
    expect(TENANT_ANCHORED_MODELS as readonly string[]).toContain("DeveloperJourneyEvent");
    expect(isUnscopedByDesign("DeveloperJourneyEvent", "findMany", { where: { at: { gte: new Date() } } })).toBe(false);
    expect(isUnscopedByDesign("DeveloperJourneyEvent", "findUnique", { where: { id: "x" } })).toBe(false);
  });
});
