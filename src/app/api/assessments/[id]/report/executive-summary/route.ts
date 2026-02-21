/** GET: Executive Summary PDF */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse } from "@/lib/report/report-auth";
import { getReportSummary } from "@/lib/report/report-data";
import { generateExecutiveSummaryPdf } from "@/lib/report/pdf-generator";

export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const summary = await getReportSummary(assessmentId);
  const pdf = generateExecutiveSummaryPdf(summary);

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${auth.assessment.companyName}_Executive_Summary.pdf"`,
    },
  });
}
