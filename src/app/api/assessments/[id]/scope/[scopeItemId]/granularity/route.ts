/**
 * PATCH /api/assessments/[id]/scope/[scopeItemId]/granularity
 *
 * Update granularity tier (coarse | medium | fine) and verdict
 * (mostly_fit | mostly_config | has_gaps | needs_workshop) on a ScopeSelection.
 *
 * Validation rules (per design spec):
 *   - Medium granularity REQUIRES assessmentVerdict
 *   - Fine granularity does not (step-level data carries the verdict implicitly)
 *   - Coarse clears the verdict
 *
 * Side-effect: recompute Assessment rollup counts (granularityCoarse/Medium/Fine)
 * in the same transaction so dashboard badges update atomically.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";

const GRANULARITY_VALUES = ["coarse", "medium", "fine"] as const;
const VERDICT_VALUES = [
  "mostly_fit",
  "mostly_config",
  "has_gaps",
  "needs_workshop",
] as const;

const patchSchema = z
  .object({
    granularity: z.enum(GRANULARITY_VALUES),
    assessmentVerdict: z.enum(VERDICT_VALUES).nullable().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      v.granularity !== "medium" ||
      (v.assessmentVerdict !== null && v.assessmentVerdict !== undefined),
    {
      message: "assessmentVerdict is required when granularity is 'medium'",
      path: ["assessmentVerdict"],
    },
  );

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; scopeItemId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assessmentId, scopeItemId } = await ctx.params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }
  if (
    user.organizationId !== assessment.organizationId &&
    user.role !== "platform_admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const sel = await prisma.scopeSelection.findUnique({
    where: { assessmentId_scopeItemId: { assessmentId, scopeItemId } },
    select: { id: true, granularity: true },
  });
  if (!sel) {
    return NextResponse.json(
      { error: "ScopeSelection not found — select the scope item first" },
      { status: 404 },
    );
  }

  // Coarse clears verdict; Medium/Fine keep what came in (or existing).
  const verdict =
    parsed.data.granularity === "coarse"
      ? null
      : (parsed.data.assessmentVerdict ?? null);

  // updatedAt + audit fields
  const previousGranularity = sel.granularity;
  const isUpgrade =
    GRANULARITY_VALUES.indexOf(parsed.data.granularity) >
    GRANULARITY_VALUES.indexOf(
      previousGranularity as (typeof GRANULARITY_VALUES)[number],
    );

  const updateData: {
    granularity: string;
    assessmentVerdict: string | null;
    notes?: string;
    upgradedAt?: Date;
    upgradedBy?: string;
  } = {
    granularity: parsed.data.granularity,
    assessmentVerdict: verdict,
  };
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (isUpgrade) {
    updateData.upgradedAt = new Date();
    updateData.upgradedBy = user.id;
  }

  // Atomic: update the row + recompute Assessment rollup counts.
  // Three parallel counts instead of groupBy (more portable across Prisma client
  // generations + simpler types).
  const [updated, coarseCount, mediumCount, fineCount] = await prisma.$transaction([
    prisma.scopeSelection.update({
      where: { id: sel.id },
      data: updateData,
      select: {
        id: true,
        granularity: true,
        assessmentVerdict: true,
        notes: true,
        upgradedAt: true,
      },
    }),
    prisma.scopeSelection.count({
      where: { assessmentId, selected: true, granularity: "coarse" },
    }),
    prisma.scopeSelection.count({
      where: { assessmentId, selected: true, granularity: "medium" },
    }),
    prisma.scopeSelection.count({
      where: { assessmentId, selected: true, granularity: "fine" },
    }),
  ]);

  const counts = { coarse: coarseCount, medium: mediumCount, fine: fineCount };
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      granularityCoarse: counts.coarse,
      granularityMedium: counts.medium,
      granularityFine: counts.fine,
    },
  });

  return NextResponse.json({
    ok: true,
    selection: updated,
    rollup: counts,
  });
}
