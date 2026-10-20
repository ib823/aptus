/**
 * POST /api/studio/interfaces/[id]/capture-fixture
 *
 * Records what a run actually returned, so a developer's own test suite can
 * replay it offline. The run already happened in the Test Console, so this costs
 * no additional SAP call.
 *
 * One fixture per (interface, scenario): re-capturing REPLACES rather than
 * accumulating, because a pile of near-identical recordings is not a richer
 * fixture set, it is just a question about which one is current.
 *
 * Records are truncated to a small sample. A fixture is an example, not a data
 * export — shipping a thousand rows of a client's business data inside a starter
 * kit would be a leak dressed up as a convenience.
 *
 * THE BROKER'S OUTCOME DECIDES THE SCENARIO (P0.4, A57). The console sends the
 * run's broker status (`readStatus`), and the scenario, status and error code
 * follow from it through the broker's own tables (fixtures.ts), so a run the
 * broker answers 404 NOT_FOUND is recorded as 404 NOT_FOUND — not as the 502
 * UPSTREAM_ERROR it used to become. A console open across the deploy sends
 * the older `honestStatus`, which is still read.
 *
 * STAMPED WITH THE CONTRACT (P0.4, A38): the interface version and entity set
 * it was recorded under. The starter kit ships only fixtures whose stamp still
 * matches; a capture from a run of an earlier contract is refused with 409.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { captureContractMismatch } from "@/lib/studio/contract-provenance";
import {
  buildFixtureBody,
  isFixtureScenario,
  isReadStatus,
  SCENARIO_STATUS,
  scenarioForOutcome,
  scenarioForReadStatus,
} from "@/lib/studio/fixtures";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** The broker's read outcome for the run (NorthboundReadStatus). Preferred. */
  readStatus: z.string().min(1).optional(),
  /** The honest status the run reported — what a console from before readStatus sends. */
  honestStatus: z.string().min(1).optional(),
  /**
   * The broker's sentence for the run (`note` on broker-run), served as the
   * fixture's error message. The code is never the caller's: it is the
   * broker's code for the outcome.
   */
  detail: z.string().max(2000).optional(),
  /** The contract the run was against, as broker-run reported it. */
  interfaceVersion: z.number().int().min(1).optional(),
  entitySet: z.string().max(200).nullable().optional(),
  /**
   * The status the TENANT returned on that run.
   *
   * Optional because an older client will not send it, and rejecting those
   * would break capture rather than improve it. What it must never do is
   * DEFAULT: an absent value is recorded as null, meaning "this fixture cannot
   * prove where it came from", which is a different claim from 200.
   */
  sourceStatus: z.number().int().min(100).max(599).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (!canMutateStudio(user.role)) {
    return studioError("FORBIDDEN", "Your role can view interfaces but not capture fixtures.");
  }
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");

  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return studioError("FORBIDDEN", "No organization scope.");
  const scope = scoped.scope;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid fixture payload.");

  const { readStatus, honestStatus } = parsed.data;
  const scenario =
    readStatus !== undefined
      ? isReadStatus(readStatus)
        ? scenarioForReadStatus(readStatus, parsed.data.rows.length)
        : null
      : honestStatus !== undefined
        ? scenarioForOutcome(honestStatus, parsed.data.rows.length, parsed.data.sourceStatus)
        : null;
  if (!scenario || !isFixtureScenario(scenario)) {
    // A run that failed for a local reason teaches a consumer nothing about how
    // the tenant behaves, so there is nothing worth recording.
    return studioError("VALIDATION_ERROR", "That outcome is not a recordable scenario.");
  }

  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, id),
    select: { id: true, name: true, version: true, entitySet: true },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  const mismatch = captureContractMismatch(parsed.data, iface);
  if (mismatch) return studioError("CONFLICT", mismatch);
  const stamp = { interfaceVersion: iface.version, entitySet: iface.entitySet };

  const body = buildFixtureBody(scenario, parsed.data.rows, parsed.data.detail);
  const status = SCENARIO_STATUS[scenario];

  // Replace any existing recording of this scenario — see the header.
  const existing = await prisma.mockFixture.findFirst({
    where: { organizationId: scope.organizationId, interfaceId: iface.id, scenario },
    select: { id: true },
  });

  const saved = existing
    ? await prisma.mockFixture.update({
        where: { id: existing.id, organizationId: scope.organizationId },
        // sourceStatus is written on every replace, including back to null when
        // the caller did not send one. A stale provenance stamp left over from a
        // previous capture would be worse than none: it would evidence a run
        // that is no longer the one stored here.
        data: {
          status,
          body: body as never,
          sourceStatus: parsed.data.sourceStatus ?? null,
          capturedAt: new Date(),
          ...stamp,
        },
        select: { id: true, scenario: true, status: true, sourceStatus: true, capturedAt: true },
      })
    : await prisma.mockFixture.create({
        data: {
          organizationId: scope.organizationId,
          interfaceId: iface.id,
          scenario,
          status,
          body: body as never,
          sourceStatus: parsed.data.sourceStatus ?? null,
          ...stamp,
        },
        select: { id: true, scenario: true, status: true, sourceStatus: true, capturedAt: true },
      });

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: iface.id,
    action: "UPDATE",
    after: { event: "mock_fixture_captured", scenario, status, rows: body.records?.length ?? 0, ...stamp },
  });

  return studioOk({
    id: saved.id,
    scenario: saved.scenario,
    status: saved.status,
    rows: body.records?.length ?? 0,
    replaced: Boolean(existing),
  });
}
