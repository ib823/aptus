/** GET: Process Flow Atlas PDF — all flow diagrams compiled into single PDF */

import { NextResponse, type NextRequest } from "next/server";
import { authenticateForReport, isErrorResponse } from "@/lib/report/report-auth";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId, false);
  if (isErrorResponse(auth)) return auth;

  const diagrams = await prisma.processFlowDiagram.findMany({
    where: { assessmentId },
    select: {
      scopeItemId: true,
      processFlowName: true,
      stepCount: true,
      fitCount: true,
      configureCount: true,
      gapCount: true,
      naCount: true,
      pendingCount: true,
    },
    orderBy: [{ scopeItemId: "asc" }, { processFlowName: "asc" }],
  });

  if (diagrams.length === 0) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No flow diagrams generated yet" } },
      { status: 400 },
    );
  }

  // Get scope item names
  const scopeItemIds = [...new Set(diagrams.map((d) => d.scopeItemId))];
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: scopeItemIds } },
    select: { id: true, nameClean: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.nameClean]));

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Cover page
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageWidth, 50, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text("Process Flow Atlas", 20, 28);
  doc.setFontSize(12);
  doc.text(auth.assessment.companyName, 20, 40);

  let y = 65;
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(11);

  // Color legend
  doc.text("Status Legend:", 20, y);
  y += 8;
  const legendItems = [
    { color: [34, 197, 94], label: "FIT — Standard process works" },
    { color: [59, 130, 246], label: "CONFIGURE — Configuration needed" },
    { color: [245, 158, 11], label: "GAP — Gap identified" },
    { color: [156, 163, 175], label: "N/A or PENDING" },
  ];
  for (const item of legendItems) {
    doc.setFillColor(item.color[0] ?? 0, item.color[1] ?? 0, item.color[2] ?? 0);
    doc.rect(20, y - 3, 8, 4, "F");
    doc.setFontSize(9);
    doc.text(item.label, 32, y);
    y += 7;
  }

  // Summary stats
  y += 5;
  doc.setFontSize(11);
  const totalSteps = diagrams.reduce((s, d) => s + d.stepCount, 0);
  const totalFit = diagrams.reduce((s, d) => s + d.fitCount, 0);
  const totalGap = diagrams.reduce((s, d) => s + d.gapCount, 0);
  doc.text(`Total Diagrams: ${diagrams.length} | Scope Items: ${scopeItemIds.length} | Total Steps: ${totalSteps}`, 20, y);
  y += 6;
  doc.text(`FIT: ${totalFit} | GAP: ${totalGap} | Fit Rate: ${totalSteps > 0 ? Math.round(((totalFit) / totalSteps) * 100) : 0}%`, 20, y);

  // Table of contents
  doc.addPage();
  doc.setFontSize(16);
  doc.text("Table of Contents", 20, 20);

  const tocRows = diagrams.map((d, i) => [
    String(i + 1),
    d.scopeItemId,
    scopeMap.get(d.scopeItemId) ?? d.scopeItemId,
    d.processFlowName,
    String(d.stepCount),
    String(d.fitCount),
    String(d.gapCount),
  ]);

  autoTable(doc, {
    startY: 30,
    head: [["#", "Scope ID", "Scope Item", "Flow Name", "Steps", "FIT", "GAP"]],
    body: tocRows,
    theme: "grid",
    headStyles: { fillColor: [17, 24, 39], fontSize: 8 },
    styles: { fontSize: 7 },
    margin: { left: 20, right: 20 },
  });

  // One page per diagram (summary — actual SVGs are served separately)
  for (let i = 0; i < diagrams.length; i++) {
    const d = diagrams[i];
    if (!d) continue;
    doc.addPage();
    doc.setFontSize(14);
    doc.text(`${d.scopeItemId} — ${scopeMap.get(d.scopeItemId) ?? d.scopeItemId}`, 20, 20);
    doc.setFontSize(11);
    doc.text(d.processFlowName, 20, 28);

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Steps: ${d.stepCount} | FIT: ${d.fitCount} | CONFIGURE: ${d.configureCount} | GAP: ${d.gapCount} | N/A: ${d.naCount} | Pending: ${d.pendingCount}`, 20, 38);
    doc.setTextColor(17, 24, 39);
  }

  const pdf = new Uint8Array(doc.output("arraybuffer"));

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${auth.assessment.companyName}_Process_Flow_Atlas.pdf"`,
    },
  });
}
