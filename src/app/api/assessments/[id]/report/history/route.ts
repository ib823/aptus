/** GET: List report generation history for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse } from "@/lib/report/report-auth";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateForReport(id);
  if (isErrorResponse(auth)) return auth;

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
