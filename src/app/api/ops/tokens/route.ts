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
 * ONE CREDENTIAL PER SOLUTION. Issuance upserts on solutionId, so re-issuing
 * replaces the previous token and its environment rather than accumulating. The
 * response reports the count so a screen cannot imply concurrent credentials.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsOrgFilter, requireOperations } from "@/lib/ops/guard";
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

  // Counted, never selected. `secretsCiphertext` holds the write credential, so
  // a separate count answers "does one exist" without loading the value into
  // memory — and it becomes a real number the moment issuance ships, rather than
  // a hardcoded zero someone has to remember to update.
  const withWriteCredentialPromise = prisma.solutionClient.count({
    where: { ...opsOrgFilter(guard.actor), secretsCiphertext: { not: null } },
  });

  const rows = await prisma.solutionClient.findMany({
    where: {
      ...opsOrgFilter(guard.actor),
      ...(includeRevoked ? {} : { isActive: true }),
    },
    select: {
      id: true,
      organizationId: true,
      solutionId: true,
      label: true,
      environment: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      // secretsCiphertext holds the write credential; tokenHash holds the read
      // one. Neither is selected, here or anywhere reachable from a client.
    },
    orderBy: { createdAt: "desc" },
  });

  // Solution names are fetched separately: SolutionClient carries `solutionId`
  // but has no relation to Solution (its only relation is Organization), so a
  // nested select is not expressible. Scoped identically to the query above --
  // an unscoped lookup here would leak names across tenants even though the
  // credential rows themselves were correctly scoped.
  const solutions = await prisma.solution.findMany({
    where: {
      ...opsOrgFilter(guard.actor),
      id: { in: [...new Set(rows.map((r) => r.solutionId))] },
    },
    select: { id: true, name: true, status: true },
  });
  const solutionById = new Map(solutions.map((s) => [s.id, s]));

  let active = 0;
  let revoked = 0;
  let expired = 0;
  let expiringSoon = 0;
  let neverUsed = 0;
  const withWriteCredential = await withWriteCredentialPromise;

  for (const r of rows) {
    if (r.revokedAt !== null || !r.isActive) revoked++;
    else if (r.expiresAt !== null && r.expiresAt.getTime() <= now.getTime()) expired++;
    else {
      active++;
      if (r.expiresAt !== null && r.expiresAt.getTime() <= soon.getTime()) expiringSoon++;
    }
    if (r.lastUsedAt === null) neverUsed++;
  }

  return studioOk({
    scope: guard.actor.kind,
    counts: {
      total: rows.length,
      active,
      revoked,
      expired,
      expiringSoon,
      neverObservedInUse: neverUsed,
      withWriteCredential,
    },
    provenance: {
      lastUsedUnderReports: true,
      why: "lastUsedAt is written fire-and-forget and a serverless instance can freeze before it lands. It is last OBSERVED use, and is not on its own sufficient to conclude a credential is dormant.",
      oneCredentialPerSolution:
        "Issuance upserts on solutionId — re-issuing replaces the previous token and its environment rather than adding one.",
      writeCredentials:
        "Counted from stored credential presence, never by reading it. No code path issues a write credential yet, so a zero here is by design rather than by absence of activity.",
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
      state:
        r.revokedAt !== null || !r.isActive
          ? "revoked"
          : r.expiresAt !== null && r.expiresAt.getTime() <= now.getTime()
            ? "expired"
            : r.expiresAt !== null && r.expiresAt.getTime() <= soon.getTime()
              ? "expiring-soon"
              : "active",
      lastObservedUseAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
