/**
 * GET /api/assessments/[id]/requirements/export
 * Streams an XLSX of all ClientRequirements for an assessment, structured
 * the same way the source spreadsheets are (one sheet per module). Lets us
 * round-trip: import → edit in-app → export back to the client.
 */

import { type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { contentDisposition } from "@/lib/security/filename";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: assessmentId } = await ctx.params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, companyName: true, organizationId: true },
  });
  if (!assessment) {
    return new Response("Not found", { status: 404 });
  }

  if (
    user.organizationId !== assessment.organizationId &&
    user.role !== "platform_admin"
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const requirements = await prisma.clientRequirement.findMany({
    where: { assessmentId },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Aptus";
  wb.created = new Date();

  // Group by module → one sheet per module
  const byModule = new Map<string, typeof requirements>();
  for (const r of requirements) {
    if (!byModule.has(r.module)) byModule.set(r.module, []);
    byModule.get(r.module)!.push(r);
  }

  for (const [moduleName, rows] of byModule.entries()) {
    // Excel sheet names: <=31 chars, can't contain : \ / ? * [ ]
    const safeName = moduleName.replace(/[:\\/?*[\]]/g, "_").slice(0, 31);
    const ws = wb.addWorksheet(safeName);

    ws.columns = [
      { header: "No", key: "code", width: 10 },
      { header: "Section", key: "section", width: 28 },
      { header: "Client Key Requirement", key: "requirementText", width: 60 },
      { header: "Requirement Type", key: "requirementType", width: 14 },
      { header: "Client Remarks", key: "clientRemarks", width: 28 },
      { header: "Solution Provider Response", key: "solutionProviderResponse", width: 22 },
      { header: "Solution Provider Remarks", key: "solutionProviderRemarks", width: 60 },
      { header: "ERP Module supporting", key: "erpModuleSupporting", width: 40 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle", wrapText: true };

    for (const r of rows) {
      ws.addRow({
        code: r.code,
        section: r.section ?? "",
        requirementText: r.requirementText,
        requirementType: r.requirementType ?? "",
        clientRemarks: r.clientRemarks ?? "",
        solutionProviderResponse: r.solutionProviderResponse ?? "",
        solutionProviderRemarks: r.solutionProviderRemarks ?? "",
        erpModuleSupporting: r.erpModuleSupporting ?? "",
      });
    }

    // wrap long text columns
    for (const col of ["requirementText", "solutionProviderRemarks", "erpModuleSupporting"]) {
      ws.getColumn(col).alignment = { wrapText: true, vertical: "top" };
    }
  }

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const filename = `${assessment.companyName}_Requirements.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
    },
  });
}
