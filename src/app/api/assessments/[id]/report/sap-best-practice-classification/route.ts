/** GET: SAP Best-Practice Classification — PDF (default) or XLSX (?format=xlsx)
 *
 * Reads exclusively from `ClientRequirement.solutionProviderResponse` (the
 * analyzer's independent verdict against the SAP S/4HANA Cloud Public
 * Edition 2602 catalog). Stays separate from the existing 16 reports —
 * those aggregate analyst-output (StepResponse + GapResolution) and we
 * never want the two classification streams to land in one chart.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateForReport,
  isErrorResponse,
  sanitizeFilename,
} from "@/lib/report/report-auth";
import { getSapBestPracticeClassificationData } from "@/lib/report/report-data";
import { loadAssessmentBranding } from "@/lib/report/branding";
import { generateSapBestPracticeClassificationPdf } from "@/lib/report/pdf-generator";
import {
  generateXlsx,
  sapBestPracticeClassificationSheets,
} from "@/lib/report/xlsx-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "pdf").toLowerCase();
  const data = await getSapBestPracticeClassificationData(assessmentId);
  const prefix = sanitizeFilename(auth.assessment.companyName);

  if (format === "xlsx") {
    const xlsx = await generateXlsx(sapBestPracticeClassificationSheets(data));
    return new NextResponse(xlsx as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${prefix}_SAP_Best_Practice_Classification.xlsx"`,
      },
    });
  }

  const branding = await loadAssessmentBranding(assessmentId);
  const pdf = generateSapBestPracticeClassificationPdf(data, branding);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${prefix}_SAP_Best_Practice_Classification.pdf"`,
    },
  });
}
