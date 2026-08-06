/**
 * Idempotency for northbound writes.
 *
 * THE PROBLEM THIS SOLVES. A write into a customer's production SAP must survive
 * being retried. Networks drop responses after the server has already committed;
 * HTTP clients retry on timeout; load balancers replay. Without a dedup key, one
 * logical write becomes two records in a client's ledger — which is the classic
 * way an integration quietly corrupts financial data, and the reason the write
 * path was held back until this existed.
 *
 * HOW IT WORKS. The caller supplies an `Idempotency-Key` — they are the only
 * party who knows that two requests express the same intent. We reserve that key
 * before touching SAP, and the UNIQUE CONSTRAINT is what actually enforces the
 * guarantee: two concurrent requests carrying one key cannot both insert, so the
 * loser is detected rather than proceeding.
 *
 * WHY THE REQUEST IS FINGERPRINTED. Reusing a key with a DIFFERENT body is a
 * client bug. Replaying the old response would silently swallow the second,
 * genuinely-different write; so that case is a 409 rather than a quiet success.
 *
 * WHAT A REPLAY RETURNS. The stored outcome, byte for byte — same status, same
 * body. A retry must be indistinguishable from the original call, otherwise the
 * client's own retry logic starts branching on which attempt it is.
 */

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/studio/tenant-scope";

/** How long a key stays honoured. Longer than any sane client retry window. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Keys are caller-chosen; bound the shape so the column cannot be abused as storage. */
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,255}$/;

export function isValidIdempotencyKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Fingerprint the request.
 *
 * Canonicalised by sorting object keys, so a client that serialises the same
 * payload with a different property order is treated as the same request rather
 * than being wrongly rejected as a conflict.
 */
export function hashRequest(payload: unknown): string {
  return createHash("sha256").update(canonicalise(payload)).digest("hex");
}

function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
}

export interface ReservationInput {
  scope: TenantScope;
  solutionId: string;
  interfaceId: string;
  key: string;
  payload: unknown;
}

export type Reservation =
  /** First time we have seen this key — the caller should perform the write. */
  | { outcome: "proceed"; recordId: string }
  /** Already completed. Return the stored response verbatim. */
  | { outcome: "replay"; status: number; body: unknown }
  /** Same key, different body — a client bug, not a retry. */
  | { outcome: "conflict"; reason: "PAYLOAD_MISMATCH" }
  /** Same key, still running. Two concurrent attempts at one intent. */
  | { outcome: "conflict"; reason: "IN_FLIGHT" };

/**
 * Claim the key, or discover what already happened under it.
 *
 * Called BEFORE the SAP request, so a duplicate never reaches the tenant.
 */
export async function reserveIdempotencyKey(
  input: ReservationInput,
  now: Date = new Date(),
): Promise<Reservation> {
  const organizationId = input.scope.organizationId;
  const requestHash = hashRequest(input.payload);

  const existing = await prisma.northboundIdempotencyKey.findUnique({
    where: {
      organizationId_solutionId_key: {
        organizationId,
        solutionId: input.solutionId,
        key: input.key,
      },
    },
    select: { id: true, interfaceId: true, requestHash: true, status: true, responseBody: true, expiresAt: true },
  });

  if (existing) {
    // An expired record is not a retry of anything — the client has come back
    // long after any reasonable retry window, so treat the key as fresh.
    if (existing.expiresAt.getTime() <= now.getTime()) {
      await prisma.northboundIdempotencyKey.update({
        // organizationId alongside the id: the model is tenant-anchored and the
        // scope guard requires every mutation's where to carry the tenant.
        where: { id: existing.id, organizationId },
        data: {
          requestHash,
          // The interface too — the reset re-opens the key for THIS request,
          // and leaving the old interfaceId stranded the row's attribution on
          // whatever interface used the key last time.
          interfaceId: input.interfaceId,
          status: null,
          // Prisma.DbNull, not `undefined` — `undefined` means "leave the column
          // alone", which would strand the OLD response on a key we have just
          // reopened, and a later retry would replay a result from a different
          // request entirely.
          responseBody: Prisma.DbNull,
          createdAt: now,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
      });
      return { outcome: "proceed", recordId: existing.id };
    }

    /*
     * THE INTERFACE IS PART OF THE IDENTITY. The key is unique per
     * (organization, solution, key) and this comparison used to check only the
     * payload hash — so an IDENTICAL {entity, record} posted with one key to
     * interface A and then to interface B replayed A's stored response and
     * NEVER WROTE B. Same bytes, different destination, silently swallowed:
     * exactly the "second write disappears without a trace" failure the
     * PAYLOAD_MISMATCH arm below exists to prevent, arriving through the field
     * the comparison forgot. A different interface is a different request,
     * whatever the payload says.
     */
    if (existing.interfaceId !== input.interfaceId) {
      return { outcome: "conflict", reason: "PAYLOAD_MISMATCH" };
    }

    if (existing.requestHash !== requestHash) {
      // Replaying the stored response here would make the caller's SECOND,
      // different write disappear without a trace.
      return { outcome: "conflict", reason: "PAYLOAD_MISMATCH" };
    }

    if (existing.status === null) {
      return { outcome: "conflict", reason: "IN_FLIGHT" };
    }

    return { outcome: "replay", status: existing.status, body: existing.responseBody };
  }

  try {
    const created = await prisma.northboundIdempotencyKey.create({
      data: {
        organizationId,
        solutionId: input.solutionId,
        interfaceId: input.interfaceId,
        key: input.key,
        requestHash,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      },
      select: { id: true },
    });
    return { outcome: "proceed", recordId: created.id };
  } catch {
    // Lost the race against a concurrent request carrying the same key. The
    // unique constraint is the real guarantee; this is where it pays off.
    return { outcome: "conflict", reason: "IN_FLIGHT" };
  }
}

/**
 * Record the terminal outcome so a later retry replays it.
 *
 * Stores FAILURES too. A 403 that is retried should return the same 403 rather
 * than re-attempting a write the tenant already refused.
 */
export async function completeIdempotencyKey(
  scope: TenantScope,
  recordId: string,
  status: number,
  body: unknown,
): Promise<void> {
  try {
    await prisma.northboundIdempotencyKey.update({
      // The id is server-derived, but the model is tenant-anchored: every
      // mutation's where carries the tenant so the scope guard can see it.
      where: { id: recordId, organizationId: scope.organizationId },
      data: { status, responseBody: body as never },
    });
  } catch (err) {
    // Loud, never fatal: the write itself succeeded, and losing the caller's
    // result because bookkeeping failed would be the worse outcome. The cost is
    // that a retry may be reported as IN_FLIGHT until the key expires — which
    // fails safe, because it does not write twice.
    console.error("[northbound-idempotency] failed to record outcome", { recordId, status, err });
  }
}

/**
 * Release a reservation that never reached SAP.
 *
 * Used when the request is rejected BEFORE any write is attempted (bad payload,
 * failed gate). Without this, a client that fixed their payload and retried with
 * the same key would be told the request is still in flight forever.
 */
export async function releaseIdempotencyKey(scope: TenantScope, recordId: string): Promise<void> {
  try {
    await prisma.northboundIdempotencyKey.delete({
      where: { id: recordId, organizationId: scope.organizationId },
    });
  } catch (err) {
    console.warn("[northbound-idempotency] failed to release reservation", { recordId, err });
  }
}
