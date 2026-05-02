/** GET: Gap Register XLSX */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse, sanitizeFilename } from "@/lib/report/report-auth";
import { getGapDataForReport } from "@/lib/report/report-data";
import { generateXlsx, gapRegisterSheet } from "@/lib/report/xlsx-generator";
import { prisma } from "@/lib/db/prisma";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const [data, assessment] = await Promise.all([
    getGapDataForReport(assessmentId),
    prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { currencyCode: true },
    }),
  ]);
  const xlsx = await generateXlsx([gapRegisterSheet(data, assessment?.currencyCode ?? "USD")]);

  return new NextResponse(xlsx as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(auth.assessment.companyName)}_Gap_Register.xlsx"`,
    },
  });
}
