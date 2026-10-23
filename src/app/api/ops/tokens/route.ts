/**
 * GET /api/ops/tokens — the runtime credential fleet.
 *
 * METADATA ONLY, structurally. `tokenHash` and `secretsCiphertext` are never
 * selected, so there is no field in this response that could become a
 * credential. That is a property of the query, not of remembering to redact.
 *
 * `lastUsedAt` UNDER-REPORTS, and the response says so. It is written
 * fire-and-forget (`void touchClientLastUsed(...)`) and a serverless instance can
 * freeze the moment a response is returned, so the update often does not land.
 * It is therefore last *observed* use — a weak signal, and specifically NOT
 * sufficient on its own to conclude a credential is dormant and safe to revoke.
 * Presenting it as "last used" would invite exactly that conclusion.
 *
 * ONE CREDENTIAL PER (SOLUTION, ENVIRONMENT) — AD-11. Issuance upserts on that
 * pair, so re-issuing for an environment replaces its token rather than
 * accumulating, while a second environment adds a row beside it. The response
 * reports the count so a screen cannot imply more concurrency than that.
 *
 * P0.11: a live TEST or PROD key with no expiry is its own state,
 * `no-expiry`, shown as "no expiry - set one" — it predates mandatory expiry,
 * still works, and needs a rotation. An expired key is `expired` and is never
 * counted as active. A key inside its rotation overlap says until when the key
 * it replaced still works (`previousValidUntil`).
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { keyState, overlapIsOpen, storedTokenPrefix } from "@/lib/northbound/key-policy";
import { opsWhere, requireOperations } from "@/lib/ops/guard";
import { countPresentableWriteKeys } from "@/lib/ops/write-keys";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

/** Inside this window, an expiry is close enough to act on. */
const EXPIRING_SOON_DAYS = 14;

export async function GET(request: NextRequest) {
  const guard = await requireOperations();
  if (!guard.ok) return guard.response;

  const now = new Date();
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);
  const includeRevoked = request.nextUrl.searchParams.get("includeRevoked") === "1";

  const [rows, withWriteCredential, revoked] = await Promise.all([
    prisma.solutionClient.findMany({
      where: opsWhere(guard.actor, includeRevoked ? {} : { isActive: true }),
      select: {
        id: true,
        organizationId: true,
        solutionId: true,
        label: true,
        environment: true,
        tokenPrefix: true,
        // The key's own last four (P0.3, A45): its masked reference, not a secret.
        tokenTail: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        previousValidUntil: true,
        revokedAt: true,
        createdAt: true,
        // secretsCiphertext holds the write credential; tokenHash and
        // previousTokenHash hold read ones. None is selected, here or anywhere
        // reachable from a client.
      },
      orderBy: { createdAt: "desc" },
    }),

    // Counted, never selected. `secretsCiphertext` holds the write credential,
    // so a count answers "does one exist" without loading the value into memory.
    //
    // OVER LIVE CREDENTIALS ONLY (P0.3, A62), by the predicate authentication
    // applies: a write key sealed on an expired, revoked or deactivated
    // credential, or on a retired app's (review round 4), can never be
    // presented, because the bearer token it travels with is refused first.
    // Counting it said a write path existed that does not. (A revocation
    // clears the sealed key anyway; an expiry or a retirement does not.)
    //
    // In `Promise.all` rather than started early and awaited later: the previous
    // shape kicked this off and attached its handler two `await`s further down,
    // so a rejection in the gap was an unhandled rejection rather than a 500.
    countPresentableWriteKeys(guard.actor, now),

    // REVOKED IS COUNTED SEPARATELY, AND THAT IS THE WHOLE POINT.
    //
    // The list above filters `isActive: true` unless `includeRevoked=1`, while
    // `revokeClientToken` sets BOTH `isActive: false` and `revokedAt`. So the
    // revoked branch of the loop below could only ever fire for a row that was
    // revoked and still active — which no code path produces. The default view
    // rendered `revoked: 0` and implied nothing had ever been revoked, on the
    // one screen an operator would consult to find out.
    prisma.solutionClient.count({
      where: opsWhere(guard.actor, {
        OR: [{ isActive: false }, { revokedAt: { not: null } }],
      }),
    }),
  ]);

  // Solution names are fetched separately: SolutionClient carries `solutionId`
  // but has no relation to Solution (its only relation is Organization), so a
  // nested select is not expressible. Scoped identically to the query above --
  // an unscoped lookup here would leak names across tenants even though the
  // credential rows themselves were correctly scoped.
  const solutions = await prisma.solution.findMany({
    where: opsWhere(guard.actor, {
      id: { in: [...new Set(rows.map((r) => r.solutionId))] },
    }),
    select: { id: true, name: true, status: true },
  });
  const solutionById = new Map(solutions.map((s) => [s.id, s]));

  /** One state per row, from the predicate authentication itself uses. */
  const stateOf = (r: (typeof rows)[number]) => {
    const state = keyState(r, now);
    if (state === "revoked" || state === "inactive") return "revoked" as const;
    if (state === "expired") return "expired" as const;
    if (state === "noExpiry") return "no-expiry" as const;
    return r.expiresAt !== null && r.expiresAt.getTime() <= soon.getTime()
      ? ("expiring-soon" as const)
      : ("active" as const);
  };

  let active = 0;
  let expired = 0;
  let expiringSoon = 0;
  let noExpiry = 0;
  let neverUsed = 0;

  for (const r of rows) {
    // A revoked row only appears here with `includeRevoked=1`; it is counted by
    // its own query either way, so it is skipped rather than double-counted.
    const state = stateOf(r);
    if (state === "revoked") continue;
    if (state === "expired") expired++;
    else {
      // Live: it authenticates. A key with no expiry where one is required
      // still works, so it is active AND flagged.
      active++;
      if (state === "expiring-soon") expiringSoon++;
      if (state === "no-expiry") noExpiry++;
    }
    if (r.lastUsedAt === null) neverUsed++;
  }

  return studioOk({
    scope: guard.actor.kind,
    counts: {
      /** How many rows `credentials` below actually holds. */
      listed: rows.length,
      active,
      /** Over every credential, revoked or not — see the note on the query. */
      revoked,
      expired,
      expiringSoon,
      /** Live TEST or PROD keys issued before expiry was mandatory (P0.11). */
      noExpiry,
      neverObservedInUse: neverUsed,
      withWriteCredential,
    },
    provenance: {
      lastUsedUnderReports: true,
      countBasis:
        "`revoked` is counted over every credential in scope. The other counts are over the rows listed below, which exclude revoked credentials unless includeRevoked=1 — so they will not sum to `revoked + listed` in the default view.",
      why: "lastUsedAt is written fire-and-forget and a serverless instance can freeze before it lands. It is last OBSERVED use, and is not on its own sufficient to conclude a credential is dormant.",
      oneCredentialPerSolution:
        "Issuance upserts on (solutionId, environment) — re-issuing for the same environment replaces the previous token rather than adding one; another environment adds a credential beside it.",
      writeCredentials:
        "Write keys are counted over live credentials of apps that are not retired only (the credentials authentication accepts), from their stored presence, never by reading one. A write key is issued in Developer Studio (API Access, Runtime credentials, Issue write key) by someone who does not own the app, after a second person has approved a CREATE or UPDATE grant for that environment. A zero means none has been issued onto a live credential.",
    },
    credentials: rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      solutionId: r.solutionId,
      // Null when the solution is not in this tenant, which for a scoped caller
      // cannot happen -- stated rather than defaulted to a plausible string.
      solutionName: solutionById.get(r.solutionId)?.name ?? null,
      solutionStatus: solutionById.get(r.solutionId)?.status ?? null,
      label: r.label,
      environment: r.environment,
      /** `ce_live_`, `ce_test_`, or `ce_` for a key minted before P0.11. Never the key. */
      tokenPrefix: storedTokenPrefix(r.tokenPrefix),
      /** The key's own last four (P0.3, A45), or null for a key minted before they were recorded. */
      tokenTail: r.tokenTail,
      state: stateOf(r),
      lastObservedUseAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      /**
       * Until when the key a rotation replaced still works, while that window
       * is open on a live key; null otherwise.
       */
      previousValidUntil:
        stateOf(r) !== "revoked" && r.previousValidUntil !== null && overlapIsOpen(r.previousValidUntil, now)
          ? r.previousValidUntil.toISOString()
          : null,
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
