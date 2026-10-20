/**
 * The developer journey: recording its milestones, and reading them back as
 * time to first call (roadmap P2.12). The computation itself is pure and lives
 * in journey-metrics.ts; this module is the database half.
 *
 * FIRST OCCURRENCE ONLY. Every milestone is an insert with
 * `ON CONFLICT DO NOTHING` on (organizationId, kind, scopeKey), so the first
 * time is the one kept: a retried request, a second serverless instance or
 * tonight's probe sweep cannot move it. The scope keys are built here and
 * nowhere else (`journeyScopeKey`).
 *
 * NEVER IN THE WAY. A milestone is a measurement, not a control: every write
 * catches its own failure and logs it, so the action that caused it (a sign-up,
 * a decision, a key) succeeds exactly as it did before this existed. Writes
 * happen after the action's own transaction, never inside it.
 *
 * THE HOT PATH PAYS NOTHING. A broker call records "first call" through
 * `noteFirstCall`, which consults a per-process set first: once this instance
 * has recorded (or found) the first call for an (app, environment), every
 * later call returns without touching the database. So the database sees one
 * insert per (app, environment) per instance lifetime, never one per call.
 * The connection probes go through the same guard.
 *
 * OFF SWITCH: COREEDGE_JOURNEY_EVENTS=off stops every write (the boards keep
 * showing what was recorded). Anything else, unset included, records.
 */

import { prisma } from "@/lib/db/prisma";

import {
  JOURNEY_LOOKBACK_DAYS,
  JOURNEY_WINDOW_DAYS,
  summarizeJourneys,
  type FirstCallChannel,
  type JourneyEventKind,
  type JourneyEventRow,
  type JourneySummary,
} from "./journey-metrics";

export * from "./journey-metrics";

/** process.env, or any plain map of the same variables (tests pass one). */
type EnvVars = Readonly<Record<string, string | undefined>>;

/** COREEDGE_JOURNEY_EVENTS: only the exact word "off" stops recording. */
export function journeyRecordingEnabled(env: EnvVars = process.env): boolean {
  return env.COREEDGE_JOURNEY_EVENTS?.trim().toLowerCase() !== "off";
}

/**
 * Console reads of the deployment's own tenant by someone with no
 * organization are audited under this sentinel (console-read-guard.ts). It is
 * not an organization, so it has no journey.
 */
const NOT_AN_ORGANIZATION = new Set(["-deployment-"]);

const ENVIRONMENTS = new Set(["SANDBOX", "DEV", "TEST", "PROD"]);

function environmentOrNull(value: string | null | undefined): string | null {
  return typeof value === "string" && ENVIRONMENTS.has(value) ? value : null;
}

/** What a milestone is the first OF. See the table on the Prisma model. */
export function journeyScopeKey(
  kind: JourneyEventKind,
  refs: {
    readonly solutionId?: string | null;
    readonly environment?: string | null;
    readonly subjectId?: string | null;
  } = {},
): string {
  switch (kind) {
    case "WORKSPACE_CREATED":
      return "workspace";
    case "INTERFACE_REGISTERED":
      return `solution:${refs.solutionId ?? "-"}`;
    case "GRANT_REQUESTED":
    case "GRANT_DECIDED":
      return `grant:${refs.subjectId ?? "-"}`;
    case "KEY_ISSUED":
      return `key:${refs.solutionId ?? "-"}:${refs.environment ?? "-"}`;
    case "CONNECTION_SAVED":
    case "CONNECTION_PROBE_OK":
      return `connection:${refs.subjectId ?? "-"}`;
    case "FIRST_CALL":
      return `call:${refs.solutionId ?? "console"}:${refs.environment ?? "-"}`;
  }
}

export interface JourneyEventInput {
  readonly organizationId: string;
  readonly kind: JourneyEventKind;
  readonly solutionId?: string | null;
  readonly environment?: string | null;
  readonly subjectId?: string | null;
  readonly actorUserId?: string | null;
  readonly detail?: string | null;
  /** The domain fact's own time. Defaults to now. */
  readonly at?: Date;
}

/**
 * Record a milestone unless it has happened before. Resolves true when the
 * milestone is recorded (now or earlier), false when the write failed or
 * recording is off. Never throws.
 */
export async function recordJourneyEvent(input: JourneyEventInput): Promise<boolean> {
  if (!journeyRecordingEnabled()) return false;
  if (NOT_AN_ORGANIZATION.has(input.organizationId)) return false;
  const environment = environmentOrNull(input.environment);
  const solutionId = input.solutionId ?? null;
  const subjectId = input.subjectId ?? null;
  try {
    await prisma.developerJourneyEvent.createMany({
      data: [
        {
          organizationId: input.organizationId,
          kind: input.kind,
          scopeKey: journeyScopeKey(input.kind, { solutionId, environment, subjectId }),
          solutionId,
          environment,
          subjectId,
          actorUserId: input.actorUserId ?? null,
          detail: input.detail ?? null,
          at: input.at ?? new Date(),
        },
      ],
      // ON CONFLICT DO NOTHING: the first occurrence is the one kept.
      skipDuplicates: true,
    });
    return true;
  } catch (err) {
    console.warn("[journey] milestone not recorded", {
      kind: input.kind,
      organizationId: input.organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * A decision on an access request, from whichever of the three doors settled
 * it (Studio, the CoreEdge console, Control Tower). Ends that request's
 * approver wait. `decidedAt` is the instant written on the grant.
 */
export async function recordGrantDecided(input: {
  readonly grant: {
    readonly id: string;
    readonly organizationId: string;
    readonly solutionId: string;
    readonly environment: string;
  };
  readonly decision: string;
  readonly decidedAt: Date;
  readonly deciderId: string;
}): Promise<boolean> {
  return recordJourneyEvent({
    organizationId: input.grant.organizationId,
    kind: "GRANT_DECIDED",
    solutionId: input.grant.solutionId,
    environment: input.grant.environment,
    subjectId: input.grant.id,
    actorUserId: input.deciderId,
    detail: input.decision,
    at: input.decidedAt,
  });
}

/* ── the cheap guard ─────────────────────────────────────────────────── */

/** Past this many keys the set is cleared: at worst one more no-op insert each. */
const MAX_REMEMBERED = 10_000;
const remembered = new Set<string>();

/** Tests only: forget what this process has recorded. */
export function forgetRecordedJourneyMilestones(): void {
  remembered.clear();
}

async function recordOnce(input: JourneyEventInput): Promise<void> {
  if (!journeyRecordingEnabled() || NOT_AN_ORGANIZATION.has(input.organizationId)) return;
  const key = `${input.organizationId}|${input.kind}|${journeyScopeKey(input.kind, {
    solutionId: input.solutionId ?? null,
    environment: environmentOrNull(input.environment),
    subjectId: input.subjectId ?? null,
  })}`;
  if (remembered.has(key)) return;
  if (remembered.size >= MAX_REMEMBERED) remembered.clear();
  // Remembered BEFORE the write, so concurrent calls in this instance do not
  // all insert; forgotten again if the write failed, so it is retried.
  remembered.add(key);
  if (!(await recordJourneyEvent(input))) remembered.delete(key);
}

/** A 2xx the caller was given. A replayed write is not a call. */
function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * The first successful call of an app (or of the console) in an environment.
 *
 * Cheap on every call after the first: see the header. `environment` is the
 * landscape that served the call — the connection's declared environment when
 * it has one, the credential's otherwise.
 */
export async function noteFirstCall(input: {
  readonly organizationId: string;
  /** Null for a console read, which no app makes. */
  readonly solutionId: string | null;
  readonly environment: string | null;
  readonly channel: FirstCallChannel;
  readonly status: number;
  readonly actorUserId?: string | null;
}): Promise<void> {
  if (!isSuccess(input.status)) return;
  const environment = environmentOrNull(input.environment);
  if (environment === null) return;
  await recordOnce({
    organizationId: input.organizationId,
    kind: "FIRST_CALL",
    solutionId: input.solutionId,
    environment,
    actorUserId: input.actorUserId ?? null,
    detail: input.channel,
  });
}

/**
 * A connection's first successful probe, from any of the three places that
 * probe (the Studio test, Probe now, the nightly sweep). Only OK counts.
 */
export async function noteConnectionProbe(input: {
  readonly organizationId: string;
  readonly connectionId: string;
  readonly environment: string | null;
  readonly status: string;
  readonly actorUserId?: string | null;
}): Promise<void> {
  if (input.status !== "OK") return;
  await recordOnce({
    organizationId: input.organizationId,
    kind: "CONNECTION_PROBE_OK",
    subjectId: input.connectionId,
    environment: input.environment,
    actorUserId: input.actorUserId ?? null,
  });
}

/* ── reading ─────────────────────────────────────────────────────────── */

/** One read's ceiling. Beyond it the summary says it is partial. */
export const MAX_JOURNEY_ROWS = 50_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The summary for one organization, or for every organization when
 * `organizationId` is null — which only a caller that has declared a
 * cross-tenant read (the ops guard's global admin) may ask for; the tenant
 * guard refuses it anywhere else.
 */
export async function loadJourneySummary(
  organizationId: string | null,
  now: Date = new Date(),
): Promise<JourneySummary> {
  const readFrom = new Date(now.getTime() - (JOURNEY_WINDOW_DAYS + JOURNEY_LOOKBACK_DAYS) * DAY_MS);
  const org = organizationId === null ? {} : { organizationId };
  const select = {
    organizationId: true,
    kind: true,
    scopeKey: true,
    solutionId: true,
    environment: true,
    subjectId: true,
    detail: true,
    at: true,
  } as const;
  const [earlierCalls, rows] = await Promise.all([
    // First calls older than the read window, whatever their age. Each is
    // written once per (app, environment) and never again, so without them
    // an app first called long ago would look, on its next request, like one
    // that has never called: an open journey instead of "already calling".
    // Bounded by apps x environments, so small.
    prisma.developerJourneyEvent.findMany({
      where: { ...org, kind: "FIRST_CALL", at: { lt: readFrom } },
      select,
      orderBy: { at: "asc" },
      take: MAX_JOURNEY_ROWS + 1,
    }),
    prisma.developerJourneyEvent.findMany({
      where: { ...org, at: { gte: readFrom } },
      select,
      orderBy: { at: "asc" },
      take: MAX_JOURNEY_ROWS + 1,
    }),
  ]);
  const truncated = rows.length > MAX_JOURNEY_ROWS || earlierCalls.length > MAX_JOURNEY_ROWS;
  // Both reads are ascending and every earlier call precedes the window.
  const events: JourneyEventRow[] = [
    ...earlierCalls.slice(0, MAX_JOURNEY_ROWS),
    ...rows.slice(0, MAX_JOURNEY_ROWS),
  ];
  return summarizeJourneys(events, now, { truncated });
}
