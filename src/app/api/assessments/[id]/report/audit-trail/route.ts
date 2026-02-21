/** GET: Decision Audit Trail XLSX — available at any assessment status */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse } from "@/lib/report/report-auth";
import { getAuditTrailForReport } from "@/lib/report/report-data";
import { generateXlsx, auditTrailSheet } from "@/lib/report/xlsx-generator";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  // Audit trail available at any status
  const auth = await authenticateForReport(assessmentId, false);
  if (isErrorResponse(auth)) return auth;

  const data = await getAuditTrailForReport(assessmentId);
  const xlsx = await generateXlsx([auditTrailSheet(data)]);

  return new NextResponse(xlsx as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${auth.assessment.companyName}_Audit_Trail.xlsx"`,
    },
  });
}
