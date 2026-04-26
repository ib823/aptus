/** GET: Requirements Findings PDF (spec §4.4) — the client-facing centerpiece.
 * For every requirement the client submitted, in plain English, what we found. */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse, sanitizeFilename } from "@/lib/report/report-auth";
import { getFindingsDataForReport } from "@/lib/report/report-data";
import { generateRequirementsFindingsPdf } from "@/lib/report/pdf-generator";
import { loadAssessmentBranding } from "@/lib/report/branding";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const [data, branding] = await Promise.all([
    getFindingsDataForReport(assessmentId),
    loadAssessmentBranding(assessmentId),
  ]);

  const pdf = generateRequirementsFindingsPdf(data, branding);

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(auth.assessment.companyName)}_Requirements_Findings.pdf"`,
    },
  });
}
