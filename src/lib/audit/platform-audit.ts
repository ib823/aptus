/**
 * The platform-scope audit trail: a change a PERSON made to a live SAP system
 * from the Workbench, outside the broker. Roadmap item P0.7.
 *
 * NOT THE GOVERNANCE TRAIL. Passkey and step-up events of tenantless actors go
 * to `PlatformGovernanceAudit` through `writePlatformGovernanceAudit`
 * (lib/studio/audit.ts), which is best-effort. A new SAP write uses THIS
 * module's fail-closed begin/complete pair, never that writer.
 *
 * THE GAP THIS CLOSES. `POST /api/sap/tdd/write` created records in a live SAP
 * tenant and left no audit row at all. `POST /api/sap/tdd/hub-content/write-test`
 * created and deleted one and recorded it with a best-effort `logDecision`,
 * written AFTER the fact and swallowed on failure. Every broker call attempts
 * an audit row; the two routes that change SAP data on a human's say-so did not.
 *
 * THE CONTRACT, which the static test `sap-write-audit-coverage.test.ts`
 * enforces on every route that imports a SAP-writing helper:
 *
 *   1. `beginPlatformAudit` BEFORE SAP is called. It inserts the
 *      `PlatformAuditEvent` and THROWS if it cannot. The route turns that into
 *      503 (`platformAuditUnavailable`) and sends nothing: a write nobody can
 *      account for is the one write this module exists to prevent. Fail-closed,
 *      not fail-loud.
 *   2. `completePlatformAudit` AFTER, with what happened. It inserts the
 *      `PlatformAuditOutcome` row and NEVER throws: by then SAP has acted, and
 *      losing the caller's answer because the outcome insert failed would hide
 *      a real change from the person who made it. The event is then left with
 *      no outcome, which is itself the signal — see below.
 *
 * APPEND-ONLY, BY CONSTRUCTION AND BY CONSTRAINT. This module exposes
 * inserts and nothing else (the write's two, and the console read's one,
 * below): no update, no delete. The outcome is its own row
 * rather than a column stamped later, and `PlatformAuditOutcome.eventId` is
 * unique, so the database refuses a second outcome for the same event instead
 * of letting it replace the first. An audit trail that can be edited is not
 * one (the same rule as northbound/audit.ts, asserted in dod-gaps.test.ts).
 *
 * AN EVENT WITH NO OUTCOME after its request must have finished is a write
 * whose result was never recorded: the function timed out mid-call, or the
 * outcome insert failed. It is reported as such on the Operations write ledger,
 * and SAP must be checked before anyone repeats the write — the same rule as
 * the ledger's "outcome unknown".
 *
 * WHY DEDICATED TABLES rather than a nullable `organizationId` on an existing
 * one: see the `PlatformAuditEvent` model comment in schema.prisma.
 *
 * AND WHAT A PERSON READ, SINCE P0.14b. Every Workbench console call that
 * reaches SAP (preview, entities, operations, capabilities, the catalogue
 * probes, Probe all, the Ariba explorer) runs on the governed pipeline as the
 * named "console" principal (lib/governed/console.ts) and leaves one
 * `PlatformConsoleRead` row, event and outcome together, written in one
 * statement (`recordPlatformConsoleRead`) after the call, because a read
 * changes nothing in SAP and is not held to the write's fail-closed rule —
 * exactly as the organization's own console row (NorthboundAuditEvent,
 * `dryRun: true`) is not. It is never billed: the usage rollup reads only
 * NorthboundAuditEvent. A console read row expires with the organization's
 * copy of the same read (northbound/retention.ts `sweepConsoleReads`, the one
 * module allowed to delete audit rows); a write's rows never do.
 *
 * NOT ON THE WRITE TABLES (wave 2 integration review round 4). Console reads
 * were `PlatformAuditEvent` rows (action SAP_CONSOLE_READ), and the code
 * before P0.14b reads every row of that table as a Workbench write: rolled
 * back to it (the release protocol's Instant Rollback keeps the migrations),
 * the Operations write ledger listed each console read as a write-back into a
 * client's SAP, most of them SUCCEEDED. No build before P0.14b reads
 * `PlatformConsoleRead`. Readers of the write trail still filter on
 * `PLATFORM_AUDIT_ACTIONS`, for the rows a pre-release build wrote there.
 */

import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { failureReasonFromError, failureReasonFromHttp } from "@/lib/northbound/failure-reason";
import { newCorrelationId } from "@/lib/northbound/respond";
import { ERROR_CODES } from "@/types/api";
import { Prisma } from "@prisma/client";

/** What a person did. One value per route that changes SAP data. */
export const PLATFORM_AUDIT_ACTIONS = ["SAP_WORKBENCH_WRITE", "SAP_WORKBENCH_WRITE_TEST"] as const;
export type PlatformAuditAction = (typeof PLATFORM_AUDIT_ACTIONS)[number];

/**
 * The action a PRE-RELEASE P0.14b build gave a console read on `PlatformAuditEvent`.
 * Nothing writes it now (console reads are `PlatformConsoleRead` rows); the
 * retention sweep still deletes such rows by age, and the write ledger never
 * lists them.
 */
export const PLATFORM_CONSOLE_READ_ACTION = "SAP_CONSOLE_READ" as const;

/**
 * What happened. Named after the write ledger's kinds on purpose, so an
 * operator reads both panels with one vocabulary.
 */
export const PLATFORM_AUDIT_OUTCOMES = {
  /** SAP accepted it (and, for a write-test, the record was deleted again). */
  SUCCEEDED: "SAP accepted the write",
  /** Refused after the event was recorded but before any write was sent. */
  BLOCKED: "refused before any write was sent to SAP — nothing was written",
  /** SAP answered and refused it (4xx). Nothing was written. */
  SAP_REFUSED: "SAP answered and refused the write — nothing was written",
  /** 5xx, a timeout, or a thrown error: SAP may have applied it. */
  OUTCOME_UNKNOWN: "SAP failed or did not answer — the write may have been applied; check SAP",
  /** A write-test created its record and could not delete it. It is still in SAP. */
  LEFT_BEHIND: "the test record was created and NOT deleted — it is still in SAP",
} as const;
export type PlatformAuditOutcomeKind = keyof typeof PLATFORM_AUDIT_OUTCOMES;

/** What an event with no outcome row means, once it is old enough to mean it. */
export const NO_OUTCOME_RECORDED =
  "the write was about to be sent and its outcome was never recorded — check SAP before repeating it";

/**
 * When an event with no outcome stops meaning "still running" and starts
 * meaning "the outcome will never be recorded". Longer than any request to
 * these routes can live (each SAP call is bounded by `{PREFIX}_TIMEOUT_MS`, 15s
 * by default, and a write-test makes at most five), with a wide margin.
 */
export const PENDING_UNRESOLVED_AFTER_MINUTES = 15;

/** The person, as the session describes them. Copied, never related. */
export interface PlatformAuditActor {
  id: string;
  email: string;
  role: string;
  organizationId: string | null;
}

/** Where the write goes, as the deployment's configuration names it. */
export interface SapWriteTarget {
  product: string;
  tenantKey: string;
  tenantLabel?: string | null;
  serviceKey: string;
  servicePath?: string | null;
  entitySet: string;
}

export interface BeginPlatformAuditInput {
  action: PlatformAuditAction;
  actor: PlatformAuditActor;
  target: SapWriteTarget;
  /** Fingerprinted, never stored: see `fingerprintPayload`. */
  payload: Record<string, unknown>;
}

export interface PlatformAuditHandle {
  id: string;
  correlationId: string;
}

/** The trail could not be written, so the write must not happen. */
export class PlatformAuditUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The platform audit row could not be written; the SAP write was not sent.");
    this.name = "PlatformAuditUnavailableError";
    this.cause = cause;
  }
}

/** Field names are capped so a pathological payload cannot bloat the row. */
const MAX_FIELDS = 50;
const MAX_FIELD_LENGTH = 64;
const MAX_REASON_LENGTH = 120;

/**
 * Enough to match a row to a payload someone produces later, and nothing a
 * reader of the audit table could learn the record's contents from: a SHA-256
 * of the JSON and the sorted top-level field NAMES. A record written into SAP
 * can hold personal data; the audit must not become a second copy of it.
 */
export function fingerprintPayload(payload: Record<string, unknown>): {
  payloadSha256: string;
  payloadFields: string[];
} {
  return {
    payloadSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    payloadFields: Object.keys(payload)
      .sort()
      .slice(0, MAX_FIELDS)
      .map((k) => k.slice(0, MAX_FIELD_LENGTH)),
  };
}

/**
 * Record that a person is about to change SAP data. Call it BEFORE the SAP
 * call, and send nothing if it throws.
 *
 * @throws PlatformAuditUnavailableError when the row cannot be written.
 */
export async function beginPlatformAudit(input: BeginPlatformAuditInput): Promise<PlatformAuditHandle> {
  const correlationId = newCorrelationId();
  const { payloadSha256, payloadFields } = fingerprintPayload(input.payload);
  try {
    const row = await prisma.platformAuditEvent.create({
      data: {
        action: input.action,
        actorUserId: input.actor.id,
        actorEmail: input.actor.email,
        actorRole: input.actor.role,
        actorOrganizationId: input.actor.organizationId,
        product: input.target.product,
        tenantKey: input.target.tenantKey,
        tenantLabel: input.target.tenantLabel ?? null,
        serviceKey: input.target.serviceKey,
        servicePath: input.target.servicePath ?? null,
        entitySet: input.target.entitySet,
        payloadSha256,
        payloadFields,
        correlationId,
      },
      select: { id: true },
    });
    return { id: row.id, correlationId };
  } catch (err) {
    console.error("[platform-audit] could not record a SAP write before sending it; refusing", {
      action: input.action,
      actorUserId: input.actor.id,
      correlationId,
      err,
    });
    throw new PlatformAuditUnavailableError(err);
  }
}

export interface PlatformAuditCompletion {
  outcome: PlatformAuditOutcomeKind;
  sapStatus?: number | null;
  /** A bounded code (HTTP_404, TIMEOUT, DELETE_NOT_SENT …), never free text. */
  reason?: string | null;
  detail?: Prisma.InputJsonValue | null;
  durationMs?: number | null;
}

/**
 * Record what happened. Never throws — SAP has already acted, and the caller
 * must still be told. At most one outcome per event: the unique `eventId`
 * makes a second one fail rather than overwrite the first.
 */
export async function completePlatformAudit(
  handle: PlatformAuditHandle,
  completion: PlatformAuditCompletion,
): Promise<void> {
  try {
    await prisma.platformAuditOutcome.create({
      data: {
        eventId: handle.id,
        outcome: completion.outcome,
        sapStatus: completion.sapStatus ?? null,
        reason: completion.reason ? completion.reason.slice(0, MAX_REASON_LENGTH) : null,
        ...(completion.detail != null ? { detail: completion.detail } : {}),
        durationMs: completion.durationMs ?? null,
      },
    });
  } catch (err) {
    // Loud, never fatal. The event is left with no outcome, which the write
    // ledger reports as "outcome never recorded — check SAP": the truth.
    console.error("[platform-audit] could not record the outcome of a SAP write; the event has none", {
      id: handle.id,
      correlationId: handle.correlationId,
      outcome: completion.outcome,
      err,
    });
  }
}

/** The answer when `beginPlatformAudit` threw: nothing was sent to SAP. */
export function platformAuditUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: ERROR_CODES.AUDIT_UNAVAILABLE,
        message:
          "The write was not sent to SAP: its audit record could not be written. Nothing was changed. Try again once the database is reachable.",
      },
    },
    { status: 503 },
  );
}

/** The outcome of a single create, from what SAP answered. */
export function outcomeForSapCreate(result: { ok: boolean; status: number }): PlatformAuditCompletion {
  if (result.ok) return { outcome: "SUCCEEDED", sapStatus: result.status };
  return {
    // A 4xx is SAP refusing; a 5xx may have been applied before it failed.
    outcome: result.status >= 500 ? "OUTCOME_UNKNOWN" : "SAP_REFUSED",
    sapStatus: result.status,
    reason: failureReasonFromHttp(result.status),
  };
}

/** The outcome of a create-then-delete write-test, from its result. */
export function outcomeForWriteTest(result: {
  created: boolean;
  deleted: boolean;
  createStatus: number;
  deleteStatus: number | null;
  location: string | null;
}): PlatformAuditCompletion {
  const detail = {
    created: result.created,
    deleted: result.deleted,
    deleteStatus: result.deleteStatus,
    // The record's address in SAP — its key, not its contents — which is what
    // an operator needs to find and remove a record left behind.
    location: result.location,
  };
  if (result.created && result.deleted) {
    return { outcome: "SUCCEEDED", sapStatus: result.createStatus, detail };
  }
  if (result.created) {
    return {
      outcome: "LEFT_BEHIND",
      sapStatus: result.createStatus,
      reason: result.deleteStatus === null ? "DELETE_NOT_SENT" : `DELETE_HTTP_${result.deleteStatus}`,
      detail,
    };
  }
  return { ...outcomeForSapCreate({ ok: false, status: result.createStatus }), detail };
}

/** The outcome when the SAP call threw: it may or may not have landed. */
export function outcomeForThrown(err: unknown): PlatformAuditCompletion {
  return { outcome: "OUTCOME_UNKNOWN", reason: failureReasonFromError(err) };
}

/* ── console reads (P0.14b) ───────────────────────────────────────────── */

/** How a console read ended. Its own vocabulary: "the write may have been applied" means nothing for a read. */
export const CONSOLE_READ_OUTCOMES = {
  /** SAP (or Ariba) answered the read. */
  SUCCEEDED: "SAP answered the read",
  /** Refused by the console's own gates (the ceilings, the host allow-list, the circuit) before any request was sent. */
  BLOCKED: "refused by the console before any request was sent to SAP",
  /** SAP answered and refused it (4xx), or refused the credential. */
  SAP_REFUSED: "SAP answered and refused the read",
  /** SAP failed (5xx), did not answer, or could not be authenticated to. */
  FAILED: "SAP failed, did not answer, or could not be authenticated to",
} as const;
export type ConsoleReadOutcomeKind = keyof typeof CONSOLE_READ_OUTCOMES;

/** The outcome kind for a console read audited at `status`, refused by a gate or not. */
export function consoleReadOutcome(status: number, blocked: boolean): ConsoleReadOutcomeKind {
  if (blocked) return "BLOCKED";
  if (status >= 200 && status < 300) return "SUCCEEDED";
  if (status >= 400 && status < 500) return "SAP_REFUSED";
  return "FAILED";
}

export interface PlatformConsoleReadInput {
  actor: PlatformAuditActor;
  /** What was read: a service key, or the fan-out's scope sentinel, as `serviceKey`; the entity set or "-". */
  target: SapWriteTarget;
  /** The parameters the person chose (entity, limit, endpoint …): fingerprinted, never stored. */
  request: Record<string, unknown>;
  /** The call's correlation id: the same one on the organization's console row, when there is one. */
  correlationId: string;
  outcome: ConsoleReadOutcomeKind;
  /** The status the read is audited under (null when it was refused before any request). */
  status: number | null;
  /** A bounded code (HTTP_429, TIMEOUT, HOST_NOT_ALLOWED …), never free text. */
  reason?: string | null;
  durationMs?: number | null;
  detail: Prisma.InputJsonValue;
}

/**
 * The statement that writes one console read: ONE row, event and outcome
 * together, in ONE round trip (P0.14b review round 3), with no transaction on
 * the response path of a console call (governed/db-budget.ts).
 *
 * The id is made here (the model's `cuid()` default is Prisma's, not the
 * database's), and so is `at` (review round 4): left to the column's DEFAULT
 * CURRENT_TIMESTAMP, a `timestamp(3)` without a zone takes the SESSION's wall
 * time, so on a database or role set to any other zone every console row was
 * off by the offset from the organization's copy of the same read, and the
 * retention sweep's UTC cutoff deleted it early or late. It is bound as UTC
 * wall time, whatever the session's zone, as idempotency.ts and
 * grant-binding.ts do.
 *
 * Into `PlatformConsoleRead`, never `PlatformAuditEvent` (integration review
 * round 4): see this file's header.
 */
export function consoleReadInsert(
  input: PlatformConsoleReadInput,
  id: string = randomUUID(),
  now: Date = new Date(),
): Prisma.Sql {
  const { payloadSha256, payloadFields } = fingerprintPayload(input.request);
  const reason = input.reason ? input.reason.slice(0, MAX_REASON_LENGTH) : null;
  const at = Prisma.sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  return Prisma.sql`/* governed:console-read-audit */
    INSERT INTO "PlatformConsoleRead"
      ("id", "actorUserId", "actorEmail", "actorRole", "actorOrganizationId", "product", "tenantKey", "tenantLabel",
       "serviceKey", "servicePath", "entitySet", "payloadSha256", "payloadFields", "correlationId",
       "outcome", "status", "reason", "detail", "durationMs", "at")
    VALUES (${id}, ${input.actor.id}, ${input.actor.email}, ${input.actor.role}, ${input.actor.organizationId},
      ${input.target.product}, ${input.target.tenantKey}, ${input.target.tenantLabel ?? null},
      ${input.target.serviceKey}, ${input.target.servicePath ?? null}, ${input.target.entitySet}, ${payloadSha256},
      ${JSON.stringify(payloadFields)}::jsonb, ${input.correlationId},
      ${input.outcome}, ${input.status}::integer, ${reason}, ${JSON.stringify(input.detail)}::jsonb,
      ${input.durationMs ?? null}::integer, ${at})`;
}

/**
 * Record one console read: the event and its outcome in ONE statement
 * (`consoleReadInsert`), after the call. Never throws: a read is not refused,
 * nor its answer lost, because the trail could not be written — the
 * organization's console row follows the same rule (northbound/audit.ts).
 * Logged loudly.
 */
export async function recordPlatformConsoleRead(input: PlatformConsoleReadInput): Promise<void> {
  try {
    await prisma.$executeRaw(consoleReadInsert(input));
  } catch (err) {
    console.error("[platform-audit] could not record a console read", {
      actorUserId: input.actor.id,
      correlationId: input.correlationId,
      outcome: input.outcome,
      err,
    });
  }
}
