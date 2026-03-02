/** PDF report generation using jsPDF */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { type BrandingConfig, DEFAULT_BRANDING, hexToRgb } from "@/lib/report/branding";

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

function resolveColor(branding: BrandingConfig, key: "primaryColor" | "secondaryColor"): [number, number, number] {
  const { r, g, b } = hexToRgb(branding[key]);
  return [r, g, b];
}

function renderFooter(doc: jsPDF, branding: BrandingConfig) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `${branding.footerText} — ${new Date().toLocaleDateString("en-US")}`,
    pw / 2,
    ph - 10,
    { align: "center" },
  );
}

export function generateExecutiveSummaryPdf(summary: ReportSummary, branding?: BrandingConfig | undefined): Uint8Array {
  const b = branding ?? DEFAULT_BRANDING;
  const primary = resolveColor(b, "primaryColor");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Brand header
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, pageWidth, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text("SAP Fit Assessment", 20, 22);
  doc.setFontSize(12);
  doc.text("Executive Summary", 20, 32);

  // Branding label
  doc.setFontSize(10);
  doc.text(b.companyName ?? "ABeam", pageWidth - 20, 22, { align: "right" });
  doc.setFontSize(8);
  doc.text("Assessment Platform", pageWidth - 20, 29, { align: "right" });

  // Company details
  let y = 55;
  doc.setTextColor(primary[0], primary[1], primary[2]);
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
  doc.setTextColor(primary[0], primary[1], primary[2]);
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
    headStyles: { fillColor: primary },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  y = getFinalY(doc, y + 60) + 12;
  doc.setFontSize(13);
  doc.setTextColor(primary[0], primary[1], primary[2]);
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
    headStyles: { fillColor: primary },
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
  doc.setTextColor(primary[0], primary[1], primary[2]);
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
    headStyles: { fillColor: primary },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  // Configuration
  y = getFinalY(doc, y + 30) + 12;

  doc.setFontSize(13);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text("Configuration Activities", 20, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(`${summary.config.total} configuration activities for selected scope items`, 20, y);

  renderFooter(doc, b);
  return new Uint8Array(doc.output("arraybuffer"));
}

export function generateEffortEstimatePdf(
  summary: ReportSummary,
  gapData: Array<{ resolutionType: string; effortDays: number; riskLevel: string }>,
  branding?: BrandingConfig | undefined,
): Uint8Array {
  const b = branding ?? DEFAULT_BRANDING;
  const primary = resolveColor(b, "primaryColor");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, pageWidth, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("Effort Estimate", 20, 22);
  doc.setFontSize(10);
  doc.text(summary.assessment.companyName, pageWidth - 20, 22, { align: "right" });

  let y = 50;
  doc.setTextColor(primary[0], primary[1], primary[2]);

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
    headStyles: { fillColor: primary },
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
    headStyles: { fillColor: primary },
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

  renderFooter(doc, b);
  return new Uint8Array(doc.output("arraybuffer"));
}

export function generateReadinessScorecardPdf(
  companyName: string,
  scorecard: {
    overallScore: number;
    overallStatus: string;
    categories: Array<{ category: string; score: number; status: string; findings: string[]; recommendations: string[] }>;
    goNoGo: string;
    executiveSummary: string;
  },
  branding?: BrandingConfig | undefined,
): Uint8Array {
  const b = branding ?? DEFAULT_BRANDING;
  const primary = resolveColor(b, "primaryColor");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, pw, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text("Readiness Scorecard", 20, 22);
  doc.setFontSize(10);
  doc.text(companyName, pw - 20, 22, { align: "right" });

  // Go/No-Go label
  const goLabel: Record<string, string> = {
    go: "GO",
    conditional_go: "CONDITIONAL GO",
    no_go: "NO GO",
  };
  doc.setFontSize(14);
  doc.text(goLabel[scorecard.goNoGo] ?? scorecard.goNoGo.toUpperCase(), pw - 20, 35, { align: "right" });

  // Overall score
  let y = 52;
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.setFontSize(36);
  doc.text(`${scorecard.overallScore}%`, 20, y);
  doc.setFontSize(11);
  doc.setTextColor(107, 114, 128);
  doc.text("Overall Readiness", 55, y - 5);

  // Executive summary
  y += 12;
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);
  const summaryLines = doc.splitTextToSize(scorecard.executiveSummary, pw - 40) as string[];
  doc.text(summaryLines, 20, y);
  y += summaryLines.length * 5 + 8;

  // Category table
  doc.setFontSize(13);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text("Category Breakdown", 20, y);
  y += 8;

  const categoryRows = scorecard.categories.map((c) => [
    c.category,
    `${c.score}%`,
    c.status.toUpperCase(),
    c.findings.join("; "),
    c.recommendations.join("; "),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Category", "Score", "Status", "Findings", "Recommendations"]],
    body: categoryRows,
    theme: "grid",
    headStyles: { fillColor: primary },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 14, halign: "center" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 50 },
      4: { cellWidth: 50 },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 2) {
        const val = String(data.cell.raw);
        if (val === "GREEN") data.cell.styles.textColor = [22, 163, 74];
        if (val === "AMBER") data.cell.styles.textColor = [217, 119, 6];
        if (val === "RED") data.cell.styles.textColor = [220, 38, 38];
      }
    },
  });

  renderFooter(doc, b);
  return new Uint8Array(doc.output("arraybuffer"));
}

interface FlowDiagramEntry {
  scopeItemId: string;
  scopeItemName: string;
  processFlowName: string;
  stepCount: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  pendingCount: number;
}

export function generateFlowAtlasPdf(
  companyName: string,
  diagrams: FlowDiagramEntry[],
  branding?: BrandingConfig | undefined,
): Uint8Array {
  const b = branding ?? DEFAULT_BRANDING;
  const primary = resolveColor(b, "primaryColor");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Cover page
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, pageWidth, 50, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text("Process Flow Atlas", 20, 28);
  doc.setFontSize(12);
  doc.text(companyName, 20, 40);

  let y = 65;
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.setFontSize(11);

  const legendItems = [
    { color: [34, 197, 94], label: "FIT — Standard process works" },
    { color: [59, 130, 246], label: "CONFIGURE — Configuration needed" },
    { color: [245, 158, 11], label: "GAP — Gap identified" },
    { color: [156, 163, 175], label: "N/A or PENDING" },
  ];
  doc.text("Status Legend:", 20, y);
  y += 8;
  for (const item of legendItems) {
    doc.setFillColor(item.color[0] ?? 0, item.color[1] ?? 0, item.color[2] ?? 0);
    doc.rect(20, y - 3, 8, 4, "F");
    doc.setFontSize(9);
    doc.text(item.label, 32, y);
    y += 7;
  }

  y += 5;
  doc.setFontSize(11);
  const totalSteps = diagrams.reduce((s, d) => s + d.stepCount, 0);
  const totalFit = diagrams.reduce((s, d) => s + d.fitCount, 0);
  const totalGap = diagrams.reduce((s, d) => s + d.gapCount, 0);
  const scopeIds = new Set(diagrams.map((d) => d.scopeItemId));
  doc.text(`Total Diagrams: ${diagrams.length} | Scope Items: ${scopeIds.size} | Total Steps: ${totalSteps}`, 20, y);
  y += 6;
  doc.text(`FIT: ${totalFit} | GAP: ${totalGap} | Fit Rate: ${totalSteps > 0 ? Math.round((totalFit / totalSteps) * 100) : 0}%`, 20, y);

  // Table of contents
  doc.addPage();
  doc.setFontSize(16);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text("Table of Contents", 20, 20);

  const tocRows = diagrams.map((d, i) => [
    String(i + 1),
    d.scopeItemId,
    d.scopeItemName,
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
    headStyles: { fillColor: primary, fontSize: 8 },
    styles: { fontSize: 7 },
    margin: { left: 20, right: 20 },
  });

  // One page per diagram
  for (const d of diagrams) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text(`${d.scopeItemId} — ${d.scopeItemName}`, 20, 20);
    doc.setFontSize(11);
    doc.text(d.processFlowName, 20, 28);
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Steps: ${d.stepCount} | FIT: ${d.fitCount} | CONFIGURE: ${d.configureCount} | GAP: ${d.gapCount} | N/A: ${d.naCount} | Pending: ${d.pendingCount}`, 20, 38);
  }

  renderFooter(doc, b);
  return new Uint8Array(doc.output("arraybuffer"));
}
