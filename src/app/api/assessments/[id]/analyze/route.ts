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
import { getCurrentUser } from "@/lib/auth/session";
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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: assessmentId } = await ctx.params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    user.organizationId !== assessment.organizationId &&
    user.role !== "platform_admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body OK
  }
  const parsed = requestSchema.safeParse(body);
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

  // Pull the full 2602 inventory and pre-filter to candidates relevant to this batch
  const allItems = await prisma.scopeItem.findMany({
    select: { id: true, name: true, functionalArea: true, totalSteps: true },
  });
  const candidates: CandidateScopeItem[] = selectRelevantCandidates(allItems, requirements);

  // Call Claude
  let classified;
  try {
    classified = await classifyBatch(
      requirements as RequirementToClassify[],
      candidates,
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
