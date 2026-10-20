// @vitest-environment node
/**
 * Time to first call, computed (P2.12): the pure half.
 *
 * The figures on both boards come from `summarizeJourneys` alone, so the rules
 * the tiles promise are pinned here: what a journey is, what is in the median
 * and what is only counted, when a figure is a lower bound, how the wait for a
 * real call splits into three parts, and that weekends are not business time.
 */

import { describe, expect, it } from "vitest";

import {
  businessMs,
  clipIntervals,
  durationStats,
  formatJourneyDuration,
  formatStat,
  JOURNEY_COPY,
  MIN_JOURNEYS_FOR_VERDICT,
  subtractIntervals,
  summarizeJourneys,
  TTFC_TARGET_MS,
  TTFRC_TARGET_MS,
  unionIntervals,
  verdictFor,
  verdictLabel,
  type JourneyEventRow,
} from "@/lib/coreedge/journey-metrics";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A Wednesday, noon UTC. */
const NOW = new Date("2026-10-21T12:00:00Z");
const ago = (ms: number) => NOW.getTime() - ms;

function ev(
  organizationId: string,
  kind: string,
  at: number,
  extra: Partial<Omit<JourneyEventRow, "at">> = {},
): JourneyEventRow {
  return {
    organizationId,
    kind,
    scopeKey: `${kind}:${extra.subjectId ?? extra.solutionId ?? "workspace"}`,
    solutionId: null,
    environment: null,
    subjectId: null,
    detail: null,
    at: new Date(at),
    ...extra,
  };
}

/** A completed TTFRC journey for app `app` in org `org`, on weekdays. */
function realJourney(org: string, app: string, start: number, opts: { decidedAfter?: number; calledAfter?: number }) {
  const rows = [ev(org, "GRANT_REQUESTED", start, { solutionId: app, environment: "DEV", subjectId: `g-${app}` })];
  if (opts.decidedAfter !== undefined) {
    rows.push(ev(org, "GRANT_DECIDED", start + opts.decidedAfter, { solutionId: app, environment: "DEV", subjectId: `g-${app}`, detail: "APPROVED" }));
  }
  if (opts.calledAfter !== undefined) {
    rows.push(ev(org, "FIRST_CALL", start + opts.calledAfter, { solutionId: app, environment: "DEV", detail: "broker" }));
  }
  return rows;
}

describe("business time", () => {
  it("counts weekdays and skips Saturday and Sunday (UTC)", () => {
    const fri = Date.parse("2026-10-23T16:00:00Z");
    const mon = Date.parse("2026-10-26T16:00:00Z");
    // Friday 16:00 to Monday 16:00 is one business day: Friday's 8 hours and Monday's 16.
    expect(businessMs(new Date(fri), new Date(mon))).toBe(DAY);
    expect(businessMs(new Date(mon), new Date(fri))).toBe(0);
    const sat = Date.parse("2026-10-24T09:00:00Z");
    expect(businessMs(new Date(sat), new Date(sat + 5 * HOUR))).toBe(0);
  });
});

describe("intervals", () => {
  it("merges, clips and subtracts", () => {
    const merged = unionIntervals([
      { from: 5, to: 8 },
      { from: 0, to: 3 },
      { from: 2, to: 4 },
      { from: 9, to: 9 },
    ]);
    expect(merged).toEqual([
      { from: 0, to: 4 },
      { from: 5, to: 8 },
    ]);
    expect(clipIntervals(merged, { from: 1, to: 6 })).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 6 },
    ]);
    expect(subtractIntervals([{ from: 0, to: 10 }], [{ from: 2, to: 3 }, { from: 5, to: 12 }])).toEqual([
      { from: 0, to: 2 },
      { from: 3, to: 5 },
    ]);
  });
});

describe("median and p90 with open journeys", () => {
  it("is exact when every journey has finished (nearest rank)", () => {
    const stats = durationStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((ms) => ({ ms, open: false })));
    expect(stats).toEqual({ n: 10, median: 5, p90: 9, medianIsLowerBound: false, p90IsLowerBound: false });
  });

  it("is a lower bound when an open journey sits at or below it", () => {
    const stats = durationStats([
      { ms: 1, open: true },
      { ms: 5, open: false },
      { ms: 9, open: false },
    ]);
    expect(stats.median).toBe(5);
    expect(stats.medianIsLowerBound).toBe(true);
  });

  it("stays exact when the open journeys are already past it", () => {
    const stats = durationStats([
      { ms: 1, open: false },
      { ms: 2, open: false },
      { ms: 50, open: true },
    ]);
    expect(stats).toMatchObject({ median: 2, medianIsLowerBound: false, p90: 50, p90IsLowerBound: true });
  });

  it("judges only with enough journeys, and never passes a lower bound", () => {
    const tenOf = (ms: number, open = false) => Array.from({ length: MIN_JOURNEYS_FOR_VERDICT }, () => ({ ms, open }));
    expect(verdictFor(durationStats([]), TTFC_TARGET_MS)).toBe("none");
    expect(verdictFor(durationStats([{ ms: 1, open: false }]), TTFC_TARGET_MS)).toBe("tooFew");
    expect(verdictFor(durationStats(tenOf(TTFC_TARGET_MS)), TTFC_TARGET_MS)).toBe("meets");
    expect(verdictFor(durationStats(tenOf(TTFC_TARGET_MS + 1)), TTFC_TARGET_MS)).toBe("misses");
    expect(verdictFor(durationStats(tenOf(MINUTE, true)), TTFC_TARGET_MS)).toBe("unsettled");
    // A lower bound already past the target is a miss whatever happens next.
    expect(verdictFor(durationStats(tenOf(TTFC_TARGET_MS * 2, true)), TTFC_TARGET_MS)).toBe("misses");
    expect(verdictLabel("tooFew", 3)).toBe("Too few to judge: 3 of 10 journeys");
  });
});

describe("time to first call", () => {
  it("runs from the workspace to its first successful call of any kind", () => {
    const summary = summarizeJourneys(
      [
        ev("a", "WORKSPACE_CREATED", ago(2 * DAY)),
        ev("a", "FIRST_CALL", ago(2 * DAY) + 12 * MINUTE, { environment: "SANDBOX", detail: "console" }),
        // A later first call in another environment does not move it.
        ev("a", "FIRST_CALL", ago(2 * DAY) + 50 * MINUTE, { solutionId: "s", environment: "DEV", detail: "broker" }),
        ev("b", "WORKSPACE_CREATED", ago(DAY)),
        ev("b", "FIRST_CALL", ago(DAY) + 40 * MINUTE, { solutionId: "s2", environment: "SANDBOX", detail: "test-console" }),
        // Signed up, never called: counted, not in the median.
        ev("c", "WORKSPACE_CREATED", ago(HOUR)),
        // Before the window: not a journey in it.
        ev("d", "WORKSPACE_CREATED", ago(120 * DAY)),
        ev("d", "FIRST_CALL", ago(120 * DAY) + MINUTE, { environment: "SANDBOX", detail: "console" }),
        // A call with no sign-up (an organization an admin created) is no journey.
        ev("e", "FIRST_CALL", ago(DAY), { environment: "SANDBOX", detail: "console" }),
      ],
      NOW,
    );
    expect(summary.ttfc).toMatchObject({
      completed: 2,
      open: 1,
      targetMs: TTFC_TARGET_MS,
      verdict: "tooFew",
      stats: { n: 2, median: 12 * MINUTE, p90: 40 * MINUTE, medianIsLowerBound: false },
    });
  });
});

describe("time to first real call", () => {
  it("splits business time into approver wait, SAP set-up wait and developer time", () => {
    const mon = Date.parse("2026-10-19T09:00:00Z");
    const summary = summarizeJourneys(
      [
        ...realJourney("acme", "portal", mon, { decidedAfter: 2 * HOUR, calledAfter: 6 * HOUR }),
        ev("acme", "CONNECTION_SAVED", mon + HOUR, { subjectId: "c1", environment: "DEV" }),
        ev("acme", "CONNECTION_PROBE_OK", mon + 5 * HOUR, { subjectId: "c1", environment: "DEV" }),
      ],
      NOW,
    );
    expect(summary.ttfrc.stats).toMatchObject({ n: 1, median: 6 * HOUR, medianIsLowerBound: false });
    // Set-up 10:00-14:00 overlaps the approver's 10:00-11:00: that hour is the approver's.
    expect(summary.ttfrc.parts.approverWait.median).toBe(2 * HOUR);
    expect(summary.ttfrc.parts.sapSetupWait.median).toBe(3 * HOUR);
    expect(summary.ttfrc.parts.developerTime.median).toBe(HOUR);
    expect(summary.ttfrc.targetMs).toBe(TTFRC_TARGET_MS);
  });

  it("does not count a weekend in the wait", () => {
    const fri = Date.parse("2026-10-16T16:00:00Z");
    const summary = summarizeJourneys(
      realJourney("acme", "portal", fri, { decidedAfter: 3 * DAY, calledAfter: 3 * DAY + HOUR }),
      NOW,
    );
    // Friday 16:00 -> Monday 16:00 approver wait is one business day, then an hour.
    expect(summary.ttfrc.parts.approverWait.median).toBe(DAY);
    expect(summary.ttfrc.stats.median).toBe(DAY + HOUR);
  });

  it("keeps open journeys in the median as lower bounds, and says what each waits on", () => {
    const summary = summarizeJourneys(
      [
        ...realJourney("acme", "done", ago(DAY), { decidedAfter: HOUR, calledAfter: 2 * HOUR }),
        // Waiting on an approver.
        ...realJourney("acme", "awaiting", ago(3 * HOUR), {}),
        // Decided; its DEV connection has not passed a probe yet.
        ...realJourney("beta", "setup", ago(4 * HOUR), { decidedAfter: HOUR }),
        ev("beta", "CONNECTION_SAVED", ago(4 * HOUR), { subjectId: "c2", environment: "DEV" }),
        // Decided, connection working: the developer is next.
        ...realJourney("gamma", "dev", ago(5 * HOUR), { decidedAfter: HOUR }),
      ],
      NOW,
    );
    expect(summary.ttfrc).toMatchObject({
      completed: 1,
      open: 3,
      openWaitingOn: { approver: 1, sapSetup: 1, developer: 1 },
    });
    expect(summary.ttfrc.stats.n).toBe(4);
    expect(summary.ttfrc.stats.medianIsLowerBound).toBe(true);
    // The SAP set-up still open counts as set-up wait, less the approver's hour.
    expect(summary.ttfrc.parts.sapSetupWait.p90).toBe(3 * HOUR);
  });

  describe("a finished journey's approver wait is the requests that gated its call", () => {
    const mon = Date.parse("2026-10-19T08:00:00Z");
    const dev = (extra: Partial<Omit<JourneyEventRow, "at">> = {}) => ({
      solutionId: "portal",
      environment: "DEV",
      subjectId: "g-dev",
      ...extra,
    });
    const prod = (extra: Partial<Omit<JourneyEventRow, "at">> = {}) => ({
      solutionId: "portal",
      environment: "PROD",
      subjectId: "g-prod",
      ...extra,
    });
    const devApprovedThenCalled = [
      ev("acme", "GRANT_REQUESTED", mon, dev()),
      ev("acme", "GRANT_REQUESTED", mon, prod()),
      ev("acme", "GRANT_DECIDED", mon + HOUR, dev({ detail: "APPROVED" })),
      ev("acme", "FIRST_CALL", mon + 21 * HOUR, dev({ subjectId: null, detail: "broker" })),
    ];

    it("does not count a parallel PROD request still pending when the DEV call succeeded", () => {
      const summary = summarizeJourneys(devApprovedThenCalled, NOW);
      expect(summary.ttfrc).toMatchObject({ completed: 1, open: 0 });
      expect(summary.ttfrc.stats.median).toBe(21 * HOUR);
      expect(summary.ttfrc.parts.approverWait.median).toBe(HOUR);
      expect(summary.ttfrc.parts.developerTime.median).toBe(20 * HOUR);
    });

    it("does not count a parallel PROD request decided after the DEV call", () => {
      const summary = summarizeJourneys(
        [...devApprovedThenCalled, ev("acme", "GRANT_DECIDED", mon + 30 * HOUR, prod({ detail: "APPROVED" }))],
        NOW,
      );
      expect(summary.ttfrc.parts.approverWait.median).toBe(HOUR);
      expect(summary.ttfrc.parts.developerTime.median).toBe(20 * HOUR);
    });

    it("does not count a PROD request decided before the DEV call either: the call did not need it", () => {
      const summary = summarizeJourneys(
        [...devApprovedThenCalled, ev("acme", "GRANT_DECIDED", mon + 15 * HOUR, prod({ detail: "APPROVED" }))],
        NOW,
      );
      expect(summary.ttfrc.parts.approverWait.median).toBe(HOUR);
      expect(summary.ttfrc.parts.developerTime.median).toBe(20 * HOUR);
    });

    it("does not count a write request in the same environment that was still pending at the call", () => {
      const summary = summarizeJourneys(
        [
          ev("acme", "GRANT_REQUESTED", mon, dev()),
          ev("acme", "GRANT_REQUESTED", mon, dev({ subjectId: "g-dev-write" })),
          ev("acme", "GRANT_DECIDED", mon + HOUR, dev({ detail: "APPROVED" })),
          ev("acme", "FIRST_CALL", mon + 21 * HOUR, dev({ subjectId: null, detail: "broker" })),
        ],
        NOW,
      );
      expect(summary.ttfrc.parts.approverWait.median).toBe(HOUR);
      expect(summary.ttfrc.parts.developerTime.median).toBe(20 * HOUR);
    });

    it("still counts every request decided before the call when none was in the call's environment", () => {
      // The call was served by a connection in TEST although the app only asked for DEV.
      const summary = summarizeJourneys(
        [
          ev("acme", "GRANT_REQUESTED", mon, dev()),
          ev("acme", "GRANT_DECIDED", mon + 3 * HOUR, dev({ detail: "APPROVED" })),
          ev("acme", "FIRST_CALL", mon + 5 * HOUR, dev({ environment: "TEST", subjectId: null, detail: "broker" })),
        ],
        NOW,
      );
      expect(summary.ttfrc.parts.approverWait.median).toBe(3 * HOUR);
      expect(summary.ttfrc.parts.developerTime.median).toBe(2 * HOUR);
    });

    it("keeps every pending request in an open journey's approver wait", () => {
      const summary = summarizeJourneys(
        [
          ev("acme", "GRANT_REQUESTED", ago(5 * HOUR), dev()),
          ev("acme", "GRANT_REQUESTED", ago(5 * HOUR), prod()),
          ev("acme", "GRANT_DECIDED", ago(4 * HOUR), dev({ detail: "APPROVED" })),
        ],
        NOW,
      );
      expect(summary.ttfrc).toMatchObject({ open: 1, openWaitingOn: { approver: 1 } });
      expect(summary.ttfrc.parts.approverWait.median).toBe(5 * HOUR);
    });
  });

  it("excludes an app already calling a real system before its first recorded request", () => {
    const summary = summarizeJourneys(
      [
        ev("acme", "FIRST_CALL", ago(10 * DAY), { solutionId: "old", environment: "PROD", detail: "broker" }),
        ...realJourney("acme", "old", ago(DAY), { decidedAfter: HOUR }),
      ],
      NOW,
    );
    expect(summary.ttfrc).toMatchObject({ completed: 0, open: 0, excludedAlreadyCalling: 1, stats: { n: 0 } });
  });

  it("ignores SANDBOX requests and console reads: neither is a real call", () => {
    const summary = summarizeJourneys(
      [
        ev("acme", "GRANT_REQUESTED", ago(DAY), { solutionId: "s", environment: "SANDBOX", subjectId: "g" }),
        ev("acme", "GRANT_REQUESTED", ago(DAY), { solutionId: "t", environment: "DEV", subjectId: "g2" }),
        ev("acme", "FIRST_CALL", ago(HOUR), { solutionId: null, environment: "DEV", detail: "console" }),
      ],
      NOW,
    );
    expect(summary.ttfrc).toMatchObject({ completed: 0, open: 1, stats: { n: 1 } });
  });
});

describe("the funnel", () => {
  it("counts each organization once per milestone in the window", () => {
    const summary = summarizeJourneys(
      [
        ev("a", "WORKSPACE_CREATED", ago(DAY)),
        ev("a", "INTERFACE_REGISTERED", ago(DAY), { solutionId: "s1" }),
        ev("a", "INTERFACE_REGISTERED", ago(DAY), { solutionId: "s2" }),
        ev("a", "FIRST_CALL", ago(HOUR), { solutionId: "s1", environment: "TEST", detail: "test-console" }),
        ev("b", "FIRST_CALL", ago(HOUR), { environment: "SANDBOX", detail: "console" }),
        ev("c", "WORKSPACE_CREATED", ago(200 * DAY)),
      ],
      NOW,
    );
    const reached = Object.fromEntries(summary.funnel.map((f) => [f.step, f.organizations]));
    expect(reached).toMatchObject({
      WORKSPACE_CREATED: 1,
      INTERFACE_REGISTERED: 1,
      FIRST_CALL: 2,
      FIRST_REAL_CALL: 1,
      GRANT_REQUESTED: 0,
    });
  });
});

describe("words", () => {
  it("formats durations in the unit that reads", () => {
    expect(formatJourneyDuration(45_000)).toBe("45 s");
    expect(formatJourneyDuration(12 * MINUTE)).toBe("12 min");
    expect(formatJourneyDuration(90 * MINUTE)).toBe("1.5 h");
    expect(formatJourneyDuration(DAY)).toBe("1 day");
    expect(formatJourneyDuration(DAY, { business: true })).toBe("1 business day");
    expect(formatJourneyDuration(2.5 * DAY, { business: true })).toBe("2.5 business days");
    expect(formatStat(null, false)).toBe("—");
    expect(formatStat(3 * HOUR, true)).toBe("at least 3 h");
  });

  it("states both targets the roadmap gives (A.3 #1 and #2)", () => {
    expect(JOURNEY_COPY.ttfc.target).toContain("30 minutes or less (60 for ABAP on-premise)");
    expect(JOURNEY_COPY.ttfrc.target).toContain("1 business day or less");
    expect(TTFC_TARGET_MS).toBe(30 * MINUTE);
    expect(TTFRC_TARGET_MS).toBe(DAY);
  });
});
