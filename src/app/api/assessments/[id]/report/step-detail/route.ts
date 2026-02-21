/** GET: Step Detail XLSX */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse } from "@/lib/report/report-auth";
import { getStepDataForReport } from "@/lib/report/report-data";
import { generateXlsx, stepDetailSheet } from "@/lib/report/xlsx-generator";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const data = await getStepDataForReport(assessmentId);
  const xlsx = await generateXlsx([stepDetailSheet(data)]);

  return new NextResponse(xlsx as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${auth.assessment.companyName}_Step_Detail.xlsx"`,
    },
  });
}
