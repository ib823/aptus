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
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import {
  buildFixtureBody,
  isFixtureScenario,
  SCENARIO_STATUS,
  scenarioForOutcome,
} from "@/lib/studio/fixtures";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** The honest status the run reported. */
  honestStatus: z.string().min(1),
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

  const scenario = scenarioForOutcome(parsed.data.honestStatus, parsed.data.rows.length);
  if (!scenario || !isFixtureScenario(scenario)) {
    // A run that failed for a local reason teaches a consumer nothing about how
    // the tenant behaves, so there is nothing worth recording.
    return studioError("VALIDATION_ERROR", "That outcome is not a recordable scenario.");
  }

  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, id),
    select: { id: true, name: true },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  const body = buildFixtureBody(scenario, parsed.data.rows);
  const status = SCENARIO_STATUS[scenario];

  // Replace any existing recording of this scenario — see the header.
  const existing = await prisma.mockFixture.findFirst({
    where: { organizationId: scope.organizationId, interfaceId: iface.id, scenario },
    select: { id: true },
  });

  const saved = existing
    ? await prisma.mockFixture.update({
        where: { id: existing.id },
        data: { status, body: body as never, capturedAt: new Date() },
        select: { id: true, scenario: true, status: true, capturedAt: true },
      })
    : await prisma.mockFixture.create({
        data: {
          organizationId: scope.organizationId,
          interfaceId: iface.id,
          scenario,
          status,
          body: body as never,
        },
        select: { id: true, scenario: true, status: true, capturedAt: true },
      });

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: iface.id,
    action: "UPDATE",
    after: { event: "mock_fixture_captured", scenario, status, rows: body.records?.length ?? 0 },
  });

  return studioOk({
    id: saved.id,
    scenario: saved.scenario,
    status: saved.status,
    rows: body.records?.length ?? 0,
    replaced: Boolean(existing),
  });
}
