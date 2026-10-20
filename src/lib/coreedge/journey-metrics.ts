/**
 * Time to first call, computed (roadmap P2.12). Pure: no database, no clock of
 * its own, safe to import from a client component.
 *
 * The rows come from `DeveloperJourneyEvent` (lib/coreedge/journey.ts writes
 * and reads them). Each row is the FIRST occurrence of one milestone, so every
 * figure here is "how long until the first time", never an average over
 * repeats.
 *
 * TWO MEASURES, each with the target the roadmap sets (Appendix A.3):
 *
 *   TTFC  — time to first call. One journey per organization that signed up
 *           for a developer workspace: from WORKSPACE_CREATED to its first
 *           successful call of any kind (a SANDBOX console read, a Test
 *           Console run or a broker call, in any environment). Target: median
 *           30 minutes or less (60 for ABAP on-premise, A.3 #1). Wall-clock
 *           time. Journeys that have not reached a call are counted and shown,
 *           not folded into the median: a sign-up nobody came back to is
 *           drop-off, which the funnel shows, not a slow first call.
 *
 *   TTFRC — time to first real call. One journey per app (Solution): from its
 *           first access request for a real environment (DEV, TEST or PROD) to
 *           its first successful governed call there (a broker call or a Test
 *           Console run, both through the pipeline with the app's credential).
 *           Target: median one business day or less (A.3 #2). Business time:
 *           Saturdays and Sundays (UTC) do not count. Split into approver wait
 *           (request -> decision), SAP-admin set-up wait (connection saved ->
 *           first successful probe) and developer time (the rest). Journeys
 *           still open ARE in the median, as "at least this long" — A.3 #2
 *           says unfinished SAP set-up is reported, not excluded — and the
 *           median is labelled a lower bound whenever an open journey could
 *           still move it.
 *
 * WHAT IS NOT MEASURED, stated so a number is not read for more than it is:
 *   - Anything before the deploy that added the table: there is no backfill.
 *   - An app that was already calling a real environment before its first
 *     recorded request: it is not on its way to a first call, so it is
 *     excluded and counted as such.
 *   - The consumer type (TS, Python, ABAP on-premise …) is not recorded, so
 *     every TTFC journey is judged against 30 minutes.
 */

export const JOURNEY_EVENT_KINDS = [
  "WORKSPACE_CREATED",
  "INTERFACE_REGISTERED",
  "GRANT_REQUESTED",
  "GRANT_DECIDED",
  "KEY_ISSUED",
  "CONNECTION_SAVED",
  "CONNECTION_PROBE_OK",
  "FIRST_CALL",
] as const;
export type JourneyEventKind = (typeof JOURNEY_EVENT_KINDS)[number];

/** How a first call was made. Only the first two are calls an app makes. */
export const FIRST_CALL_CHANNELS = ["broker", "test-console", "console"] as const;
export type FirstCallChannel = (typeof FIRST_CALL_CHANNELS)[number];

/** A real tenant: anything but SANDBOX. (There is no twin environment yet.) */
export const REAL_ENVIRONMENTS: readonly string[] = ["DEV", "TEST", "PROD"];

export function isRealEnvironment(environment: string | null | undefined): boolean {
  return typeof environment === "string" && REAL_ENVIRONMENTS.includes(environment);
}

/** The columns the computation reads. */
export interface JourneyEventRow {
  readonly organizationId: string;
  readonly kind: string;
  readonly scopeKey: string;
  readonly solutionId: string | null;
  readonly environment: string | null;
  readonly subjectId: string | null;
  readonly detail: string | null;
  readonly at: Date;
}

/* ── time ─────────────────────────────────────────────────────────────── */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** One business day is 24 hours of weekday time (A.3 #2: "1 business day"). */
export const BUSINESS_DAY_MS = DAY_MS;

/** The roadmap's targets (A.3 #1 and #2), both on the median. */
export const TTFC_TARGET_MS = 30 * MINUTE_MS;
export const TTFC_ABAP_ON_PREMISE_TARGET_MS = 60 * MINUTE_MS;
export const TTFRC_TARGET_MS = BUSINESS_DAY_MS;

/** A.3 #1: "median across at least 10 observed users". Below it, no verdict. */
export const MIN_JOURNEYS_FOR_VERDICT = 10;

/** Journeys that started in this many days are shown. */
export const JOURNEY_WINDOW_DAYS = 90;
/**
 * How far before the window the rows are read, so a journey that started in
 * the window still sees a connection saved, or a request raised, a little
 * earlier. Older than this is treated as before the journey.
 */
export const JOURNEY_LOOKBACK_DAYS = 90;

function isWeekend(utcDay: number): boolean {
  return utcDay === 0 || utcDay === 6;
}

/**
 * Weekday milliseconds between two instants, in UTC: Saturday and Sunday do
 * not count. Holidays and local time zones are not modelled (an open decision
 * in the runbook).
 */
export function businessMs(from: Date, to: Date): number {
  let start = from.getTime();
  const end = to.getTime();
  if (!(end > start)) return 0;
  let total = 0;
  while (start < end) {
    const day = new Date(start);
    const nextMidnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
    const segmentEnd = Math.min(nextMidnight, end);
    if (!isWeekend(day.getUTCDay())) total += segmentEnd - start;
    start = segmentEnd;
  }
  return total;
}

/* ── intervals ───────────────────────────────────────────────────────── */

export interface Interval {
  readonly from: number;
  readonly to: number;
}

/** Merge overlapping or touching intervals; drops empty ones. */
export function unionIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.to > i.from).sort((a, b) => a.from - b.from);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.from <= last.to) out[out.length - 1] = { from: last.from, to: Math.max(last.to, i.to) };
    else out.push({ ...i });
  }
  return out;
}

/** The parts of disjoint `intervals` that fall inside `window`. */
export function clipIntervals(intervals: readonly Interval[], window: Interval): Interval[] {
  return intervals
    .map((i) => ({ from: Math.max(i.from, window.from), to: Math.min(i.to, window.to) }))
    .filter((i) => i.to > i.from);
}

/** `a` minus `b`, both disjoint and sorted (as `unionIntervals` returns them). */
export function subtractIntervals(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const piece of a) {
    let from = piece.from;
    for (const cut of b) {
      if (cut.to <= from || cut.from >= piece.to) continue;
      if (cut.from > from) out.push({ from, to: cut.from });
      from = Math.max(from, cut.to);
      if (from >= piece.to) break;
    }
    if (from < piece.to) out.push({ from, to: piece.to });
  }
  return out;
}

function businessMsOf(intervals: readonly Interval[]): number {
  return intervals.reduce((sum, i) => sum + businessMs(new Date(i.from), new Date(i.to)), 0);
}

/* ── statistics ──────────────────────────────────────────────────────── */

/** A duration, exact for a finished journey, a lower bound for an open one. */
export interface Observation {
  readonly ms: number;
  readonly open: boolean;
}

export interface DurationStats {
  /** Journeys the figures are over. */
  readonly n: number;
  readonly median: number | null;
  readonly p90: number | null;
  /** True when an open journey could still raise the figure. */
  readonly medianIsLowerBound: boolean;
  readonly p90IsLowerBound: boolean;
}

/**
 * The nearest-rank percentile of the observations, and whether it is exact.
 *
 * Open journeys enter at their elapsed time, which is a lower bound on what
 * they will finally take, so the percentile of the bounds is a lower bound on
 * the true percentile. It is exact once at least rank-many FINISHED journeys
 * sit at or below it: those are final, so no open journey can push the value
 * at that rank any higher.
 */
function percentile(sorted: readonly Observation[], p: number): { value: number | null; lowerBound: boolean } {
  if (sorted.length === 0) return { value: null, lowerBound: false };
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  const value = sorted[rank - 1]!.ms;
  const finishedAtOrBelow = sorted.filter((o) => !o.open && o.ms <= value).length;
  return { value, lowerBound: finishedAtOrBelow < rank };
}

export function durationStats(observations: readonly Observation[]): DurationStats {
  const sorted = [...observations].sort((a, b) => a.ms - b.ms || Number(a.open) - Number(b.open));
  const median = percentile(sorted, 0.5);
  const p90 = percentile(sorted, 0.9);
  return {
    n: sorted.length,
    median: median.value,
    p90: p90.value,
    medianIsLowerBound: median.lowerBound,
    p90IsLowerBound: p90.lowerBound,
  };
}

/**
 * Does the median meet the target?
 *   none         — no journey yet.
 *   tooFew       — fewer than MIN_JOURNEYS_FOR_VERDICT: shown, not judged.
 *   meets/misses — judged on the median.
 *   unsettled    — the median is a lower bound under the target: open
 *                  journeys could still push it over, so no "meets" yet.
 */
export type JourneyVerdict = "none" | "tooFew" | "meets" | "misses" | "unsettled";

export function verdictFor(stats: DurationStats, targetMs: number): JourneyVerdict {
  if (stats.n === 0 || stats.median === null) return "none";
  if (stats.n < MIN_JOURNEYS_FOR_VERDICT) return "tooFew";
  if (stats.median > targetMs) return "misses";
  return stats.medianIsLowerBound ? "unsettled" : "meets";
}

/* ── the summary ─────────────────────────────────────────────────────── */

export interface TtfcSummary {
  readonly stats: DurationStats;
  readonly verdict: JourneyVerdict;
  readonly targetMs: number;
  /** Signed up in the window, made a call. */
  readonly completed: number;
  /** Signed up in the window, no successful call yet. Not in the median. */
  readonly open: number;
}

export type TtfrcWaitingOn = "approver" | "sapSetup" | "developer";

export interface TtfrcSummary {
  readonly stats: DurationStats;
  readonly verdict: JourneyVerdict;
  readonly targetMs: number;
  readonly completed: number;
  /** Still open, and in the median as lower bounds. */
  readonly open: number;
  /** What each open journey is waiting on right now. */
  readonly openWaitingOn: Readonly<Record<TtfrcWaitingOn, number>>;
  /** The three parts, each over the same journeys as `stats`. */
  readonly parts: Readonly<Record<"approverWait" | "sapSetupWait" | "developerTime", DurationStats>>;
  /** Apps already calling a real tenant before their first recorded request. */
  readonly excludedAlreadyCalling: number;
}

export const FUNNEL_STEPS = [
  "WORKSPACE_CREATED",
  "INTERFACE_REGISTERED",
  "GRANT_REQUESTED",
  "GRANT_DECIDED",
  "KEY_ISSUED",
  "CONNECTION_SAVED",
  "CONNECTION_PROBE_OK",
  "FIRST_CALL",
  "FIRST_REAL_CALL",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface JourneySummary {
  readonly windowDays: number;
  /** ISO instants: the window start and the moment the figures were computed. */
  readonly since: string;
  readonly computedAt: string;
  /** True when the row cap was reached, so the figures cover part of the window. */
  readonly truncated: boolean;
  readonly ttfc: TtfcSummary;
  readonly ttfrc: TtfrcSummary;
  /** Organizations that reached each milestone inside the window. */
  readonly funnel: readonly { readonly step: FunnelStep; readonly organizations: number }[];
}

/** A first call an app makes through the governed pipeline. */
function isAppCall(e: JourneyEventRow): boolean {
  return e.kind === "FIRST_CALL" && (e.detail === "broker" || e.detail === "test-console");
}

/**
 * A request and its decision, or a connection's save and its first good probe,
 * are paired by the row they are about (`subjectId`: the grant, the
 * connection), within one organization.
 */
function subjectKey(e: JourneyEventRow): string {
  return `${e.organizationId}|${e.subjectId ?? "-"}`;
}

function computeTtfc(events: readonly JourneyEventRow[], since: number, now: number): TtfcSummary {
  const firstCallByOrg = new Map<string, number[]>();
  for (const e of events) {
    if (e.kind !== "FIRST_CALL") continue;
    const list = firstCallByOrg.get(e.organizationId) ?? [];
    list.push(e.at.getTime());
    firstCallByOrg.set(e.organizationId, list);
  }
  const observations: Observation[] = [];
  let open = 0;
  for (const e of events) {
    if (e.kind !== "WORKSPACE_CREATED") continue;
    const start = e.at.getTime();
    if (start < since || start > now) continue;
    const calls = (firstCallByOrg.get(e.organizationId) ?? []).filter((t) => t >= start);
    if (calls.length === 0) {
      open += 1;
      continue;
    }
    observations.push({ ms: Math.min(...calls) - start, open: false });
  }
  const stats = durationStats(observations);
  return {
    stats,
    verdict: verdictFor(stats, TTFC_TARGET_MS),
    targetMs: TTFC_TARGET_MS,
    completed: observations.length,
    open,
  };
}

function computeTtfrc(events: readonly JourneyEventRow[], since: number, now: number): TtfrcSummary {
  const requestsBySolution = new Map<string, JourneyEventRow[]>();
  const appCallsBySolution = new Map<string, number[]>();
  const decidedAt = new Map<string, number>();
  const savedByOrg = new Map<string, JourneyEventRow[]>();
  const probedOkAt = new Map<string, number>();

  for (const e of events) {
    const solutionKey = e.solutionId === null ? null : `${e.organizationId}|${e.solutionId}`;
    if (e.kind === "GRANT_REQUESTED" && solutionKey && isRealEnvironment(e.environment)) {
      requestsBySolution.set(solutionKey, [...(requestsBySolution.get(solutionKey) ?? []), e]);
    } else if (e.kind === "GRANT_DECIDED") {
      decidedAt.set(subjectKey(e), e.at.getTime());
    } else if (isAppCall(e) && solutionKey && isRealEnvironment(e.environment)) {
      appCallsBySolution.set(solutionKey, [...(appCallsBySolution.get(solutionKey) ?? []), e.at.getTime()]);
    } else if (e.kind === "CONNECTION_SAVED" && isRealEnvironment(e.environment)) {
      savedByOrg.set(e.organizationId, [...(savedByOrg.get(e.organizationId) ?? []), e]);
    } else if (e.kind === "CONNECTION_PROBE_OK") {
      probedOkAt.set(subjectKey(e), e.at.getTime());
    }
  }

  const totals: Observation[] = [];
  const approver: Observation[] = [];
  const setup: Observation[] = [];
  const developer: Observation[] = [];
  const openWaitingOn: Record<TtfrcWaitingOn, number> = { approver: 0, sapSetup: 0, developer: 0 };
  let completed = 0;
  let open = 0;
  let excludedAlreadyCalling = 0;

  for (const [solutionKey, requests] of requestsBySolution) {
    const start = Math.min(...requests.map((r) => r.at.getTime()));
    if (start < since || start > now) continue;
    const calls = appCallsBySolution.get(solutionKey) ?? [];
    if (calls.some((t) => t < start)) {
      excludedAlreadyCalling += 1;
      continue;
    }
    const end = calls.length === 0 ? null : Math.min(...calls);
    const windowEnd = end ?? now;
    const journey: Interval = { from: start, to: windowEnd };
    const isOpen = end === null;

    // Approver wait: every real-environment request of this app, until decided.
    const approverRaw = requests.map((r) => ({
      from: r.at.getTime(),
      to: decidedAt.get(subjectKey(r)) ?? windowEnd,
    }));
    const approverSpans = clipIntervals(unionIntervals(approverRaw), journey);

    // SAP-admin set-up wait: a real connection of this organization in an
    // environment this app asked for, from its first save to its first good
    // probe. A connection that never proved itself counts only while the
    // journey is open — once a call succeeded, it was not what was waited on.
    const environments = new Set(requests.map((r) => r.environment));
    const orgId = solutionKey.slice(0, solutionKey.indexOf("|"));
    const setupRaw: Interval[] = [];
    let setupStillOpen = false;
    for (const saved of savedByOrg.get(orgId) ?? []) {
      if (!environments.has(saved.environment)) continue;
      const okAt = probedOkAt.get(subjectKey(saved));
      if (okAt === undefined) {
        if (!isOpen) continue;
        setupStillOpen = true;
        setupRaw.push({ from: saved.at.getTime(), to: windowEnd });
      } else {
        setupRaw.push({ from: saved.at.getTime(), to: okAt });
      }
    }
    // Overlap with an approver wait is the approver's: one wait is not two.
    const setupSpans = subtractIntervals(clipIntervals(unionIntervals(setupRaw), journey), approverSpans);

    const totalMs = businessMs(new Date(start), new Date(windowEnd));
    const approverMs = businessMsOf(approverSpans);
    const setupMs = businessMsOf(setupSpans);
    const developerMs = Math.max(0, totalMs - approverMs - setupMs);

    totals.push({ ms: totalMs, open: isOpen });
    approver.push({ ms: approverMs, open: isOpen });
    setup.push({ ms: setupMs, open: isOpen });
    developer.push({ ms: developerMs, open: isOpen });

    if (isOpen) {
      open += 1;
      const awaitingDecision = requests.some((r) => !decidedAt.has(subjectKey(r)));
      openWaitingOn[awaitingDecision ? "approver" : setupStillOpen ? "sapSetup" : "developer"] += 1;
    } else {
      completed += 1;
    }
  }

  const stats = durationStats(totals);
  return {
    stats,
    verdict: verdictFor(stats, TTFRC_TARGET_MS),
    targetMs: TTFRC_TARGET_MS,
    completed,
    open,
    openWaitingOn,
    parts: {
      approverWait: durationStats(approver),
      sapSetupWait: durationStats(setup),
      developerTime: durationStats(developer),
    },
    excludedAlreadyCalling,
  };
}

function computeFunnel(
  events: readonly JourneyEventRow[],
  since: number,
): { step: FunnelStep; organizations: number }[] {
  const reached = new Map<FunnelStep, Set<string>>(FUNNEL_STEPS.map((s) => [s, new Set<string>()]));
  for (const e of events) {
    if (e.at.getTime() < since) continue;
    if ((FUNNEL_STEPS as readonly string[]).includes(e.kind)) reached.get(e.kind as FunnelStep)!.add(e.organizationId);
    if (isAppCall(e) && isRealEnvironment(e.environment)) reached.get("FIRST_REAL_CALL")!.add(e.organizationId);
  }
  return FUNNEL_STEPS.map((step) => ({ step, organizations: reached.get(step)!.size }));
}

export function summarizeJourneys(
  events: readonly JourneyEventRow[],
  now: Date,
  options: { readonly windowDays?: number; readonly truncated?: boolean } = {},
): JourneySummary {
  const windowDays = options.windowDays ?? JOURNEY_WINDOW_DAYS;
  const since = now.getTime() - windowDays * DAY_MS;
  return {
    windowDays,
    since: new Date(since).toISOString(),
    computedAt: now.toISOString(),
    truncated: options.truncated ?? false,
    ttfc: computeTtfc(events, since, now.getTime()),
    ttfrc: computeTtfrc(events, since, now.getTime()),
    funnel: computeFunnel(events, since),
  };
}

/* ── words ───────────────────────────────────────────────────────────── */

/**
 * A duration in the largest unit that keeps it readable. `business` says the
 * value is weekday time, so days are business days.
 */
export function formatJourneyDuration(ms: number, options: { readonly business?: boolean } = {}): string {
  if (ms < MINUTE_MS) return `${Math.round(ms / 1000)} s`;
  if (ms < HOUR_MS) return `${Math.round(ms / MINUTE_MS)} min`;
  if (ms < DAY_MS) {
    const hours = ms / HOUR_MS;
    return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, "") : Math.round(hours)} h`;
  }
  const days = ms / DAY_MS;
  const shown = days < 10 ? days.toFixed(1).replace(/\.0$/, "") : String(Math.round(days));
  const unit = options.business ? (shown === "1" ? "business day" : "business days") : shown === "1" ? "day" : "days";
  return `${shown} ${unit}`;
}

/** "12 min", or "at least 2 business days" for a lower bound, or an em dash. */
export function formatStat(
  value: number | null,
  lowerBound: boolean,
  options: { readonly business?: boolean } = {},
): string {
  if (value === null) return "—";
  const text = formatJourneyDuration(value, options);
  return lowerBound ? `at least ${text}` : text;
}

/** The words both boards use, kept in one place so they cannot drift. */
export const JOURNEY_COPY = {
  heading: "Time to first call",
  lede: (windowDays: number) =>
    `Journeys that started in the last ${windowDays} days, from the first time each milestone happened. Recorded since this measure was added; nothing earlier is inferred.`,
  ttfc: {
    title: "Time to first call",
    measures: "From signing up for a developer workspace to the first successful call: a sandbox read, a Test Console run or a broker call.",
    target: "Target: median 30 minutes or less (60 for ABAP on-premise). The consumer type is not recorded yet, so every journey is judged against 30 minutes.",
    open: (n: number) =>
      n === 1
        ? "1 workspace has signed up and not made a successful call yet. It is not in the median."
        : `${n} workspaces have signed up and not made a successful call yet. They are not in the median.`,
  },
  ttfrc: {
    title: "Time to first real call",
    measures: "From an app's first access request for DEV, TEST or PROD to its first successful governed call there. Business time: weekends (UTC) do not count.",
    target: "Target: median 1 business day or less, approver wait and SAP set-up included.",
    open: (n: number, waiting: Readonly<Record<TtfrcWaitingOn, number>>) =>
      `${n} still open and counted as at least their time so far: ${waiting.approver} waiting on an approver, ${waiting.sapSetup} on SAP set-up, ${waiting.developer} on the developer.`,
    excluded: (n: number) =>
      n === 1
        ? "1 app was already calling a real system before its first recorded request, so it is not counted."
        : `${n} apps were already calling a real system before their first recorded request, so they are not counted.`,
    parts: {
      approverWait: "Approver wait",
      sapSetupWait: "SAP set-up wait",
      developerTime: "Developer time",
    },
    partsNote:
      "Each part is its own median over the same journeys, so the three need not add up to the median above. Approver wait runs from a request to its decision; SAP set-up wait from saving a connection to its first successful probe, less any time already counted as approver wait; developer time is the rest.",
  },
  stats: { median: "Median", p90: "90th percentile", journeys: "Journeys" },
  verdicts: {
    none: "No journeys yet",
    tooFew: (n: number) => `Too few to judge: ${n} of ${MIN_JOURNEYS_FOR_VERDICT} journeys`,
    meets: "Meets the target",
    misses: "Misses the target",
    unsettled: "Not settled: open journeys could still push the median past the target",
  },
  funnel: {
    title: "Milestones reached",
    note: "Organizations that reached each milestone in the window, each counted once. An organization that began before the window appears only in the later steps.",
    steps: {
      WORKSPACE_CREATED: "Signed up for a developer workspace",
      INTERFACE_REGISTERED: "Registered an interface",
      GRANT_REQUESTED: "Requested access",
      GRANT_DECIDED: "Had an access request decided",
      KEY_ISSUED: "Was issued a key",
      CONNECTION_SAVED: "Saved an SAP connection",
      CONNECTION_PROBE_OK: "Had a connection answer its first probe",
      FIRST_CALL: "Made a first successful call",
      FIRST_REAL_CALL: "Made a first successful call on a real system",
    } satisfies Record<FunnelStep, string>,
  },
  truncated:
    "This window holds more milestones than one read returns, so these figures cover only its earliest part.",
  unreadable: "Time to first call could not be read just now. Nothing else on this board depends on it.",
} as const;

export function verdictLabel(verdict: JourneyVerdict, n: number): string {
  return verdict === "tooFew" ? JOURNEY_COPY.verdicts.tooFew(n) : JOURNEY_COPY.verdicts[verdict];
}
