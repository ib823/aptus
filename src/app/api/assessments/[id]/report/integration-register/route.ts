/** GET: Integration Register XLSX */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse, sanitizeFilename } from "@/lib/report/report-auth";
import { getIntegrationDataForReport } from "@/lib/report/report-data";
import { generateXlsx, integrationRegisterSheets } from "@/lib/report/xlsx-generator";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const data = await getIntegrationDataForReport(assessmentId);
  const xlsx = await generateXlsx(integrationRegisterSheets(data));

  return new NextResponse(xlsx as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(auth.assessment.companyName)}_Integration_Register.xlsx"`,
    },
  });
}
