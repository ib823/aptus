/** GET: List report generation history for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export const preferredRegion = "sin1";

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

  const { id } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const reports = await prisma.reportGeneration.findMany({
    where: { assessmentId: id },
    orderBy: { generatedAt: "desc" },
    select: {
      id: true,
      reportType: true,
      status: true,
      fileUrl: true,
      fileSize: true,
      fileName: true,
      generatedBy: true,
      errorMessage: true,
      generatedAt: true,
      expiresAt: true,
    },
  });

  return NextResponse.json({ data: reports });
}
