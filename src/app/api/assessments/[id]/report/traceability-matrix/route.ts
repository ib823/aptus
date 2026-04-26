/** GET: Requirements Traceability Matrix XLSX (spec §4.5) — the searchable
 * companion to the Findings PDF. One row per requirement, with the original
 * Source File + Source Row preserved so the PMO can cross-reference. */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse, sanitizeFilename } from "@/lib/report/report-auth";
import { getTraceabilityDataForReport } from "@/lib/report/report-data";
import { generateXlsx, requirementsTraceabilitySheet } from "@/lib/report/xlsx-generator";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const data = await getTraceabilityDataForReport(assessmentId);
  const xlsx = await generateXlsx([requirementsTraceabilitySheet(data)]);

  return new NextResponse(xlsx as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(auth.assessment.companyName)}_Traceability_Matrix.xlsx"`,
    },
  });
}
