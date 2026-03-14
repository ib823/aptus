/** GET: Return all phase progress records for assessment (lazy init) */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { ASSESSMENT_PHASES } from "@/types/assessment";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const { user } = access;

  // Check assessment exists
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  // Lazy initialization: create default records if none exist
  let phases = await prisma.assessmentPhaseProgress.findMany({
    where: { assessmentId },
    orderBy: { createdAt: "asc" },
  });

  if (phases.length === 0) {
    await prisma.assessmentPhaseProgress.createMany({
      data: ASSESSMENT_PHASES.map((phase) => ({
        assessmentId,
        phase,
        status: "not_started",
        completionPct: 0,
      })),
    });

    phases = await prisma.assessmentPhaseProgress.findMany({
      where: { assessmentId },
      orderBy: { createdAt: "asc" },
    });
  }

  return NextResponse.json({ data: phases });
}
