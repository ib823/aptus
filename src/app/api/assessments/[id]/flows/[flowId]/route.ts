/** GET: Single flow diagram SVG */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; flowId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, flowId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

  const diagram = await prisma.processFlowDiagram.findFirst({
    where: { id: flowId, assessmentId },
    select: { svgContent: true },
  });

  if (!diagram) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Flow diagram not found" } },
      { status: 404 },
    );
  }

  return new NextResponse(diagram.svgContent, {
    headers: { "Content-Type": "image/svg+xml" },
  });
}
