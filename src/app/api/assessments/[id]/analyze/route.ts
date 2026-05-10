/**
 * POST /api/assessments/[id]/analyze
 *
 * Triggers AI-powered classification of pending ClientRequirements for an
 * assessment. Body: { batchSize?: number, force?: boolean, requirementIds?: string[] }
 *
 * - batchSize: how many requirements to process in this call (default 30, max 50)
 * - force: re-classify even if SP response is already set (default false)
 * - requirementIds: target a specific subset (default: all unset, oldest first)
 *
 * Returns count of processed + remaining + token usage. Caller polls until
 * remaining === 0.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { isAssessmentAccessError, requireAssessmentAccess } from "@/lib/auth/assessment-guard";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import {
  classifyBatch,
  selectRelevantCandidates,
  type CandidateScopeItem,
  type RequirementToClassify,
} from "@/lib/analyzer/classifier";

export const maxDuration = 60; // seconds

const requestSchema = z.object({
  batchSize: z.number().int().min(1).max(50).optional(),
  force: z.boolean().optional(),
  requirementIds: z.array(z.string()).optional(),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await ctx.params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

  // Need catalogVersionId beyond what the shared guard's select returns.
  const { catalogVersionId } = (await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: { catalogVersionId: true },
  }));

  // Phase 13.3 — AD-13.6: every assessment must be pinned to a catalog version
  // before classification can run. Without this, the classifier doesn't know
  // which edition's scope items + protocol to use.
  if (!catalogVersionId) {
    return NextResponse.json(
      { error: "Assessment is not pinned to a catalog version. Set Assessment.catalogVersionId before analyzing." },
      { status: 409 },
    );
  }

  // Empty body OK — every field is optional.
  const bodyResult = await safeParseJsonBody(request);
  const rawBody = bodyResult.ok ? bodyResult.data : {};
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const batchSize = parsed.data.batchSize ?? 30;
  const force = parsed.data.force ?? false;

  // Build the batch
  const where = parsed.data.requirementIds
    ? { id: { in: parsed.data.requirementIds }, assessmentId }
    : force
      ? { assessmentId }
      : { assessmentId, OR: [
          { solutionProviderResponse: null },
          { solutionProviderResponse: { startsWith: "NM" } },
          { solutionProviderResponse: "" },
        ] };

  const requirements = await prisma.clientRequirement.findMany({
    where,
    select: {
      id: true,
      module: true,
      code: true,
      requirementText: true,
      requirementType: true,
      clientRemarks: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    take: batchSize,
  });

  if (requirements.length === 0) {
    const remaining = 0;
    return NextResponse.json({
      ok: true,
      processed: 0,
      remaining,
      message: "No pending requirements to analyze",
    });
  }

  // Phase 13.3 — AD-13.6: pull only scope items pinned to this assessment's
  // catalog version. Edition isolation is enforced at the source query plus
  // a runtime assert in selectRelevantCandidates / classifyBatch.
  const allItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId },
    select: { id: true, name: true, functionalArea: true, totalSteps: true, catalogVersionId: true },
  });
  const candidates: CandidateScopeItem[] = selectRelevantCandidates(allItems, requirements, { catalogVersionId });

  // Call Claude
  let classified;
  try {
    classified = await classifyBatch(
      requirements as RequirementToClassify[],
      candidates,
      { catalogVersionId },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Classification failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // Apply results
  const resultMap = new Map(classified.results.map((r) => [r.requirementId, r]));
  let updated = 0;
  for (const req of requirements) {
    const result = resultMap.get(req.id);
    if (!result) continue;
    await prisma.clientRequirement.update({
      where: { id: req.id },
      data: {
        solutionProviderResponse: result.classification,
        solutionProviderRemarks: result.remarks,
        erpModuleSupporting: result.erpModuleSupporting,
      },
    });
    updated++;
  }

  // Count remaining
  const pendingWhere = force
    ? { assessmentId }
    : {
        assessmentId,
        OR: [
          { solutionProviderResponse: null },
          { solutionProviderResponse: { startsWith: "NM" } },
          { solutionProviderResponse: "" },
        ],
      };
  const remaining = await prisma.clientRequirement.count({ where: pendingWhere });

  return NextResponse.json({
    ok: true,
    processed: updated,
    remaining,
    usage: classified.usage,
  });
}
