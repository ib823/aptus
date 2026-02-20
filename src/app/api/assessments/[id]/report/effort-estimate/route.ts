/** GET: Effort Estimate PDF */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse } from "@/lib/report/report-auth";
import { getReportSummary } from "@/lib/report/report-data";
import { generateEffortEstimatePdf } from "@/lib/report/pdf-generator";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const summary = await getReportSummary(assessmentId);

  const gaps = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: { resolutionType: true, effortDays: true, riskLevel: true },
  });

  const gapData = gaps.map((g) => ({
    resolutionType: g.resolutionType,
    effortDays: g.effortDays ?? 0,
    riskLevel: g.riskLevel ?? "unknown",
  }));

  const pdf = generateEffortEstimatePdf(summary, gapData);

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${auth.assessment.companyName}_Effort_Estimate.pdf"`,
    },
  });
}
