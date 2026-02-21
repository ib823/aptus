/** GET: Return all phase progress records for assessment (lazy init) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { ASSESSMENT_PHASES } from "@/types/assessment";


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;

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
