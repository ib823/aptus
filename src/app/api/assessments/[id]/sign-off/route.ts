/** GET: Get sign-off process status */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) return access;
  const signOff = await prisma.signOffProcess.findUnique({
    where: { assessmentId: id },
    include: {
      areaValidations: true,
      technicalValidation: true,
      crossFuncValidation: true,
      signatures: true,
      snapshot: {
        select: { id: true, version: true, label: true, dataHash: true, createdAt: true },
      },
    },
  });

  if (!signOff) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "No sign-off process found for this assessment" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: signOff });
}
