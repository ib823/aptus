/** GET: Activity progress map for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { ActivityProgressMap } from "@/types/hierarchy";
import { z } from "zod";

const querySchema = z.object({
  scopeItemId: z.string().min(1),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Missing scopeItemId" } },
      { status: 400 },
    );
  }

  const { scopeItemId } = parsed.data;

  // Get total steps per activity
  const activityTotals = await prisma.$queryRaw<
    Array<{ activityId: string; total: number }>
  >`
    SELECT ps."activityId", COUNT(*)::int AS total
    FROM "ProcessStep" ps
    WHERE ps."scopeItemId" = ${scopeItemId}
      AND ps."activityId" IS NOT NULL
    GROUP BY ps."activityId"
  `;

  // Get response counts per activity
  const responseCounts = await prisma.$queryRaw<
    Array<{ activityId: string; fitStatus: string; count: number }>
  >`
    SELECT ps."activityId", sr."fitStatus", COUNT(*)::int AS count
    FROM "StepResponse" sr
    JOIN "ProcessStep" ps ON sr."processStepId" = ps.id
    WHERE sr."assessmentId" = ${assessmentId}
      AND ps."scopeItemId" = ${scopeItemId}
      AND ps."activityId" IS NOT NULL
    GROUP BY ps."activityId", sr."fitStatus"
  `;

  const progressMap: ActivityProgressMap = {};

  // Initialize with totals
  for (const row of activityTotals) {
    progressMap[row.activityId] = {
      total: row.total,
      reviewed: 0,
      fit: 0,
      configure: 0,
      gap: 0,
      na: 0,
      pending: row.total,
    };
  }

  // Fill in response counts
  for (const row of responseCounts) {
    const entry = progressMap[row.activityId];
    if (!entry) continue;
    switch (row.fitStatus) {
      case "FIT": entry.fit = row.count; break;
      case "CONFIGURE": entry.configure = row.count; break;
      case "GAP": entry.gap = row.count; break;
      case "NA": entry.na = row.count; break;
    }
    entry.reviewed = entry.fit + entry.configure + entry.gap + entry.na;
    entry.pending = entry.total - entry.reviewed;
  }

  return NextResponse.json(progressMap);
}
