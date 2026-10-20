/**
 * The platform-scope audit trail: a change a PERSON made to a live SAP system
 * from the Workbench, outside the broker. Roadmap item P0.7.
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
 *      `PlatformAuditOutcome` and NEVER throws: by then SAP has acted, and
 *      losing the caller's answer because the outcome insert failed would hide
 *      a real change from the person who made it. The event is then left with
 *      no outcome, which is itself the signal — see below.
 *
 * APPEND-ONLY, BY CONSTRUCTION AND BY CONSTRAINT. This module exposes two
 * inserts and nothing else: no update, no delete. The outcome is its own row
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
 */

import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { failureReasonFromError, failureReasonFromHttp } from "@/lib/northbound/failure-reason";
import { newCorrelationId } from "@/lib/northbound/respond";
import { ERROR_CODES } from "@/types/api";
import type { Prisma } from "@prisma/client";

/** What a person did. One value per route that changes SAP data. */
export const PLATFORM_AUDIT_ACTIONS = ["SAP_WORKBENCH_WRITE", "SAP_WORKBENCH_WRITE_TEST"] as const;
export type PlatformAuditAction = (typeof PLATFORM_AUDIT_ACTIONS)[number];

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
export type PlatformAuditOutcome = keyof typeof PLATFORM_AUDIT_OUTCOMES;

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
  outcome: PlatformAuditOutcome;
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
