/** PDF report generation using jsPDF */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface ReportSummary {
  assessment: {
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
    updatedAt: Date;
  };
  scope: { total: number; selected: number; maybe: number };
  steps: {
    total: number; reviewed: number; pending: number;
    fit: number; configure: number; gap: number; na: number; fitPercent: number;
  };
  gaps: {
    total: number; resolved: number; pending: number;
    totalEffortDays: number; byType: Record<string, number>;
  };
  config: { total: number };
}

/** Get the finalY from the last autoTable call */
function getFinalY(doc: jsPDF, fallback: number): number {
  const d = doc as unknown as { previousAutoTable?: { finalY?: number } };
  return d.previousAutoTable?.finalY ?? fallback;
}

export function generateExecutiveSummaryPdf(summary: ReportSummary): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Brand header
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageWidth, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text("SAP Fit Assessment", 20, 22);
  doc.setFontSize(12);
  doc.text("Executive Summary", 20, 32);

  // Bound branding
  doc.setFontSize(10);
  doc.text("bound", pageWidth - 20, 22, { align: "right" });
  doc.setFontSize(8);
  doc.text("Fit Assessment Platform", pageWidth - 20, 29, { align: "right" });

  // Company details
  let y = 55;
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(14);
  doc.text(summary.assessment.companyName, 20, y);

  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  const meta = [
    `Industry: ${summary.assessment.industry}`,
    `Country: ${summary.assessment.country}`,
    `Company Size: ${summary.assessment.companySize}`,
    `Report Date: ${summary.assessment.updatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
  ];
  for (const line of meta) {
    doc.text(line, 20, y);
    y += 6;
  }

  // Scope Summary
  y += 8;
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(13);
  doc.text("Scope Summary", 20, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Total Scope Items", String(summary.scope.total)],
      ["Selected Scope Items", String(summary.scope.selected)],
      ["Undecided (MAYBE)", String(summary.scope.maybe)],
      ["Total Process Steps", String(summary.steps.total)],
      ["Steps Reviewed", String(summary.steps.reviewed)],
      ["Steps Pending", String(summary.steps.pending)],
    ],
    theme: "grid",
    headStyles: { fillColor: [17, 24, 39] },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  y = getFinalY(doc, y + 60) + 12;
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text("Fit Analysis", 20, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Status", "Count", "Percentage"]],
    body: [
      ["FIT", String(summary.steps.fit), `${summary.steps.total > 0 ? Math.round((summary.steps.fit / summary.steps.total) * 100) : 0}%`],
      ["CONFIGURE", String(summary.steps.configure), `${summary.steps.total > 0 ? Math.round((summary.steps.configure / summary.steps.total) * 100) : 0}%`],
      ["GAP", String(summary.steps.gap), `${summary.steps.total > 0 ? Math.round((summary.steps.gap / summary.steps.total) * 100) : 0}%`],
      ["N/A", String(summary.steps.na), `${summary.steps.total > 0 ? Math.round((summary.steps.na / summary.steps.total) * 100) : 0}%`],
      ["Overall Fit Rate", "", `${summary.steps.fitPercent}%`],
    ],
    theme: "grid",
    headStyles: { fillColor: [17, 24, 39] },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  // Gap Resolution
  y = getFinalY(doc, y + 50) + 12;

  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text("Gap Resolution", 20, y);
  y += 8;

  const gapRows: string[][] = [];
  for (const [type, count] of Object.entries(summary.gaps.byType)) {
    gapRows.push([type, String(count)]);
  }
  gapRows.push(["Total Gaps", String(summary.gaps.total)]);
  gapRows.push(["Resolved", String(summary.gaps.resolved)]);
  gapRows.push(["Estimated Effort (days)", String(summary.gaps.totalEffortDays)]);

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: gapRows,
    theme: "grid",
    headStyles: { fillColor: [17, 24, 39] },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  // Configuration
  y = getFinalY(doc, y + 30) + 12;

  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text("Configuration Activities", 20, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(`${summary.config.total} configuration activities for selected scope items`, 20, y);

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Generated by Bound Fit Assessment Platform — ${new Date().toLocaleDateString("en-US")}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" },
  );

  return new Uint8Array(doc.output("arraybuffer"));
}

export function generateEffortEstimatePdf(
  summary: ReportSummary,
  gapData: Array<{ resolutionType: string; effortDays: number; riskLevel: string }>,
): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageWidth, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("Effort Estimate", 20, 22);
  doc.setFontSize(10);
  doc.text(summary.assessment.companyName, pageWidth - 20, 22, { align: "right" });

  let y = 50;
  doc.setTextColor(17, 24, 39);

  // Effort by resolution type
  doc.setFontSize(13);
  doc.text("Effort by Resolution Type", 20, y);
  y += 8;

  const effortByType: Record<string, number> = {};
  for (const g of gapData) {
    effortByType[g.resolutionType] = (effortByType[g.resolutionType] ?? 0) + g.effortDays;
  }

  const effortRows = Object.entries(effortByType).map(([type, days]) => [type, `${days} days`]);
  effortRows.push(["Total", `${summary.gaps.totalEffortDays} days`]);

  autoTable(doc, {
    startY: y,
    head: [["Resolution Type", "Estimated Effort"]],
    body: effortRows,
    theme: "grid",
    headStyles: { fillColor: [17, 24, 39] },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  // Effort by phase
  y = getFinalY(doc, y + 40) + 12;

  doc.setFontSize(13);
  doc.text("Estimated Phase Breakdown", 20, y);
  y += 8;

  const totalDays = summary.gaps.totalEffortDays;
  autoTable(doc, {
    startY: y,
    head: [["Phase", "Estimated Days", "Percentage"]],
    body: [
      ["Implementation", String(Math.round(totalDays * 0.3)), "30%"],
      ["Configuration", String(Math.round(totalDays * 0.25)), "25%"],
      ["Extensions", String(Math.round(totalDays * 0.2)), "20%"],
      ["Testing", String(Math.round(totalDays * 0.15)), "15%"],
      ["Training & Go-Live", String(Math.round(totalDays * 0.1)), "10%"],
      ["Total", String(totalDays), "100%"],
    ],
    theme: "grid",
    headStyles: { fillColor: [17, 24, 39] },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  // Confidence indicator
  y = getFinalY(doc, y + 50) + 12;

  const reviewedPercent = summary.steps.total > 0
    ? Math.round((summary.steps.reviewed / summary.steps.total) * 100)
    : 0;
  const confidence = reviewedPercent >= 90 ? "High" : reviewedPercent >= 60 ? "Medium" : "Low";

  doc.setFontSize(13);
  doc.text("Confidence Assessment", 20, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(`Steps Reviewed: ${reviewedPercent}% — Confidence: ${confidence}`, 20, y);

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Generated by Bound Fit Assessment Platform — ${new Date().toLocaleDateString("en-US")}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" },
  );

  return new Uint8Array(doc.output("arraybuffer"));
}
