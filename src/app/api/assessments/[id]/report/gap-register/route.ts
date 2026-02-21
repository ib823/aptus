/** GET: Gap Register XLSX */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse } from "@/lib/report/report-auth";
import { getGapDataForReport } from "@/lib/report/report-data";
import { generateXlsx, gapRegisterSheet } from "@/lib/report/xlsx-generator";

export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const data = await getGapDataForReport(assessmentId);
  const xlsx = await generateXlsx([gapRegisterSheet(data)]);

  return new NextResponse(xlsx as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${auth.assessment.companyName}_Gap_Register.xlsx"`,
    },
  });
}
