/** GET: OCM Impact Report XLSX */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse, sanitizeFilename } from "@/lib/report/report-auth";
import { getOcmDataForReport } from "@/lib/report/report-data";
import { generateXlsx, ocmReportSheets } from "@/lib/report/xlsx-generator";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const data = await getOcmDataForReport(assessmentId);
  const xlsx = await generateXlsx(ocmReportSheets(data));

  return new NextResponse(xlsx as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(auth.assessment.companyName)}_OCM_Impact_Report.xlsx"`,
    },
  });
}
