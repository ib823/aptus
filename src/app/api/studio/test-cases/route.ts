/**
 * /api/studio/test-cases — saved Test Console runs.
 *
 *   GET   list this organization's saved cases
 *   POST  save a run (name + request + last outcome)
 *
 * A test case records WHAT WAS RUN and WHAT CAME BACK, so a developer can replay
 * the same read later and see whether the tenant still behaves the same way. The
 * outcome is only ever what the run actually returned — PASS is not inferred from
 * "no exception", it is set from a real 200.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  interfaceId: z.string().min(1),
  name: z.string().min(1).max(200),
  /** What was run: entity, limit, tenant key — enough to replay it. */
  request: z.record(z.string(), z.unknown()),
  expectation: z.record(z.string(), z.unknown()).optional(),
  /** The honest outcome of the run being saved. */
  lastOutcome: z.enum(["PASS", "FAIL", "NOT_RUN"]).default("NOT_RUN"),
  /**
   * The status the tenant returned on the run being saved.
   *
   * Optional, never defaulted. A PASS with no httpStatus is a PASS that cannot
   * say what it passed against — which is exactly the state every record
   * written before this field existed is in, and the reader is entitled to know
   * that rather than be given a plausible number.
   */
  httpStatus: z.number().int().min(100).max(599).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const organizationId = user.organizationId;
  if (!organizationId) return studioOk({ testCases: [] });

  const interfaceId = request.nextUrl.searchParams.get("interfaceId");

  const testCases = await prisma.testCase.findMany({
    where: { organizationId, ...(interfaceId ? { interfaceId } : {}) },
    select: {
      id: true,
      name: true,
      interfaceId: true,
      request: true,
      expectation: true,
      lastRunAt: true,
      lastOutcome: true,
      httpStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return studioOk({ testCases });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (!canMutateStudio(user.role)) {
    return studioError("FORBIDDEN", "Your role can view test cases but not save them.");
  }
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const organizationId = user.organizationId;
  if (!organizationId) return studioError("FORBIDDEN", "No organization scope.");

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid test case payload.");
  const input = parsed.data;

  // Re-scope the caller-supplied interfaceId to this tenant.
  const iface = await prisma.interface.findFirst({
    where: { id: input.interfaceId, organizationId },
    select: { id: true, name: true },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  const created = await prisma.testCase.create({
    data: {
      interfaceId: iface.id,
      organizationId,
      name: input.name,
      request: input.request as never,
      ...(input.expectation ? { expectation: input.expectation as never } : {}),
      lastOutcome: input.lastOutcome,
      httpStatus: input.httpStatus ?? null,
      // Only stamp a run time if a run actually happened.
      ...(input.lastOutcome === "NOT_RUN" ? {} : { lastRunAt: new Date() }),
    },
    select: {
      id: true,
      name: true,
      interfaceId: true,
      lastOutcome: true,
      httpStatus: true,
      lastRunAt: true,
    },
  });

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "TestCase",
    entityId: created.id,
    action: "CREATE",
    after: created,
  });

  return studioOk(created, 201);
}
