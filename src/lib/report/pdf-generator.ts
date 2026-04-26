/**
 * PDF report generation using jsPDF + jspdf-autotable.
 *
 * Implements the 6 PDFs in the v1.2 report bundle (spec §4.1, 4.2, 4.3, 4.4,
 * 4.13, 4.16). Layout, color, and typography mirror the mocks at
 * `docs/design/v1.2/reports/`.
 *
 * All color decisions go through `brandColor()` (spec §5.7 — locked Aptus
 * roles never inherit a client-accent override). All outcome / status labels
 * go through the `glossary.ts` helpers (spec §5.4 voice ladder).
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  APTUS_BRAND,
  brandColor,
  brandColorRgb,
  type BrandRole,
  type BrandingConfig,
  DEFAULT_BRANDING,
  hexToRgb,
} from "@/lib/report/branding";
import {
  DOT_HEX,
  type DotTier,
  GLOSSARY_ENTRIES,
  outcomeDot,
  outcomeLabel,
  outcomeMeans,
} from "@/lib/report/glossary";
import type { ResolutionType } from "@/types/assessment";

// ── Shared types ─────────────────────────────────────────────────────────────

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

// ── Layout helpers ───────────────────────────────────────────────────────────

/** Get the page-relative finalY from the last autoTable. */
function getFinalY(doc: jsPDF, fallback: number): number {
  const d = doc as unknown as { previousAutoTable?: { finalY?: number } };
  return d.previousAutoTable?.finalY ?? fallback;
}

/** Move the cursor below the last autoTable, jumping to a new page if it
 * doesn't fit. Critical: also calls `doc.setPage()` to sync the active page
 * — `previousAutoTable.finalY` is page-relative and without this sync the
 * next text can land on the wrong page on top of existing content. */
function advancePastTable(doc: jsPDF, fallback: number, spacing: number, needed: number): number {
  const d = doc as unknown as {
    previousAutoTable?: { finalY?: number; pageNumber?: number };
    lastAutoTable?: { finalY?: number; pageNumber?: number };
  };
  const meta = d.lastAutoTable ?? d.previousAutoTable;
  if (meta?.pageNumber) doc.setPage(meta.pageNumber);
  const pageHeight = doc.internal.pageSize.getHeight();
  const finalY = meta?.finalY ?? fallback;
  let y = finalY + spacing;
  if (y + needed > pageHeight - 22) {
    doc.addPage();
    y = 25;
  }
  return y;
}

/** RGB tuple shortcut for jsPDF setters. */
function rgb(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  return [r, g, b];
}

/** Aptus brand for any locked role — short alias. */
function aptusRgb(): [number, number, number] {
  return rgb(APTUS_BRAND);
}

/** Render the small Aptus pyramid mark. Outer white triangle + dark inner
 * cutout + white dot. Matches `docs/design/v1.2/reports/print.css` cover-mark.
 * Drawn at (x, y) with given size in mm (default 5mm = roughly 14pt). */
function drawAptusMark(doc: jsPDF, x: number, y: number, size = 5): void {
  // Outer pyramid — white
  doc.setFillColor(255, 255, 255);
  doc.triangle(
    x + size / 2, y,         // apex
    x + size,     y + size,  // bottom-right
    x,            y + size,  // bottom-left
    "F",
  );
  // Inner cutout — Aptus brand (dark)
  const inner = size * 0.4;
  const innerX = x + (size - inner) / 2;
  const innerY = y + size - inner * 0.85;
  const aptus = aptusRgb();
  doc.setFillColor(aptus[0], aptus[1], aptus[2]);
  doc.triangle(
    innerX + inner / 2, innerY,
    innerX + inner,     innerY + inner * 0.85,
    innerX,             innerY + inner * 0.85,
    "F",
  );
  // Dot — white
  doc.setFillColor(255, 255, 255);
  doc.circle(x + size / 2, y + size * 0.7, size * 0.06, "F");
}

/** Render the standard cover band: Aptus-brand fill (top 90mm), Aptus mark +
 * wordmark in upper-left, title + subtitle in lower portion. Spec §2.4. */
function renderCover(
  doc: jsPDF,
  branding: BrandingConfig,
  title: string,
  subtitle: string,
): void {
  const pw = doc.internal.pageSize.getWidth();
  const cover = brandColorRgb(branding, "cover-band");

  doc.setFillColor(cover[0], cover[1], cover[2]);
  doc.rect(0, 0, pw, 90, "F");

  // Aptus mark + wordmark in upper-left
  drawAptusMark(doc, 20, 18, 5);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Aptus", 27, 22.5);

  // Title baseline at 60mm, subtitle at 72mm (per spec §2.4)
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text(title, 20, 60);

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 20, 72);

  doc.setFont("helvetica", "normal");
}

/** Cover-page metadata block (Industry / Country / etc.). Starts at 110mm. */
function renderCoverMeta(
  doc: jsPDF,
  rows: Array<[string, string]>,
): void {
  const pw = doc.internal.pageSize.getWidth();
  let y = 110;
  doc.setFontSize(9);
  for (const [label, value] of rows) {
    doc.setTextColor(82, 82, 91);
    doc.text(label, 20, y);
    doc.setTextColor(11, 11, 15);
    doc.setFontSize(10);
    doc.text(value, 60, y);
    doc.setFontSize(9);
    // hairline
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.1);
    doc.line(20, y + 2, pw - 20, y + 2);
    y += 6;
  }
}

/** Cover-page lead paragraph at 175mm. */
function renderCoverLead(doc: jsPDF, text: string): void {
  const pw = doc.internal.pageSize.getWidth();
  // Hairline above
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.1);
  doc.line(20, 168, pw - 20, 168);

  doc.setTextColor(11, 11, 15);
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, pw - 40) as string[];
  doc.text(lines, 20, 178);
}

/** Render Aptus footer on every page. */
function renderFooterOnAllPages(doc: jsPDF, fileName: string): void {
  const pageCount = doc.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.1);
    doc.line(20, ph - 14, pw - 20, ph - 14);
    doc.setFontSize(8);
    doc.setTextColor(82, 82, 91);
    doc.text(
      `Aptus · Confidential · ${i} · ${fileName}`,
      pw / 2,
      ph - 9,
      { align: "center" },
    );
  }
}

/** Inline status pill: dot + label. Returns the rightmost x coordinate so
 * callers can chain text after it. */
function drawPill(doc: jsPDF, x: number, y: number, label: string, tier: DotTier): number {
  const dotColor = rgb(DOT_HEX[tier]);
  doc.setFillColor(dotColor[0], dotColor[1], dotColor[2]);
  doc.circle(x + 1.2, y - 1.0, 1.0, "F");
  doc.setTextColor(11, 11, 15);
  doc.setFontSize(9);
  doc.text(label, x + 3.5, y);
  // Approx width: dot + gap + textWidth
  return x + 3.5 + doc.getTextWidth(label);
}

/** AutoTable header style — locked Aptus brand fill, white text. */
function aptusHeadStyles() {
  const aptus = aptusRgb();
  return {
    fillColor: aptus,
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: 9,
  };
}

// ── Generator: 01_Executive_Summary.pdf ──────────────────────────────────────

export function generateExecutiveSummaryPdf(
  summary: ReportSummary,
  branding?: BrandingConfig | undefined,
): Uint8Array {
  const b = branding ?? DEFAULT_BRANDING;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── Page 1: Cover + verdict block (bottom-anchored) ─────────────────
  renderCover(doc, b, "Executive Summary", summary.assessment.companyName);
  renderCoverMeta(doc, [
    ["Industry", summary.assessment.industry],
    ["Country", summary.assessment.country],
    ["Company size", summary.assessment.companySize],
    ["Report date", summary.assessment.updatedAt.toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    })],
    ["Prepared by", "ABeam Consulting"],
  ]);
  renderCoverLead(doc,
    `This document summarizes the SAP S/4HANA fit-to-standard assessment for ${summary.assessment.companyName}, ` +
    `covering ${summary.steps.total} business requirements across ${summary.scope.selected} in-scope process items. ` +
    `It states the verdict, the effort estimate, and the steering-committee-level recommendations.`,
  );

  // Verdict block — bottom-anchored at y = ph - 22 - blockHeight
  const ph = doc.internal.pageSize.getHeight();
  const verdictTop = ph - 22 - 60;
  const ootbPct = summary.steps.total > 0 ? Math.round((summary.steps.fit / summary.steps.total) * 100) : 0;
  const cfgPct  = summary.steps.total > 0 ? Math.round((summary.steps.configure / summary.steps.total) * 100) : 0;
  const gapPct  = summary.steps.total > 0 ? Math.round((summary.steps.gap / summary.steps.total) * 100) : 0;
  const reviewedPct = summary.steps.total > 0 ? Math.round((summary.steps.reviewed / summary.steps.total) * 100) : 0;

  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.2);
  doc.rect(20, verdictTop, doc.internal.pageSize.getWidth() - 40, 56);

  doc.setFontSize(9);
  doc.setTextColor(82, 82, 91);
  doc.text("VERDICT", 28, verdictTop + 8);

  // Three big numbers
  const aptus = aptusRgb();
  doc.setTextColor(aptus[0], aptus[1], aptus[2]);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text(`${ootbPct}%`, 28, verdictTop + 26);
  doc.text(`${cfgPct}%`, 78, verdictTop + 26);
  doc.text(`${gapPct}%`, 128, verdictTop + 26);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(82, 82, 91);
  doc.text("STANDARD SAP", 28, verdictTop + 32);
  doc.text("CONFIGURABLE", 78, verdictTop + 32);
  doc.text("NEEDS WORK",   128, verdictTop + 32);

  doc.setFontSize(10);
  doc.setTextColor(11, 11, 15);
  doc.text(
    `${summary.steps.total} requirements analysed across ${summary.scope.selected} in-scope items. ` +
    `Estimated effort: ${summary.gaps.totalEffortDays} days.`,
    28, verdictTop + 44,
  );
  doc.text("Confidence: ", 28, verdictTop + 50);
  drawPill(doc, 50, verdictTop + 50, reviewedPct >= 90 ? "High" : reviewedPct >= 60 ? "Medium" : "Low",
    reviewedPct >= 90 ? "success" : reviewedPct >= 60 ? "warning" : "danger");
  doc.text(` — ${reviewedPct}% of process steps reviewed.`, 80, verdictTop + 50);

  // ── Page 2: Scope + Fit Analysis + Gap Resolution tables ───────────
  doc.addPage();
  let y = 25;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 11, 15);
  doc.text("Scope", 20, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Total Scope Items", String(summary.scope.total)],
      ["Selected Scope Items", String(summary.scope.selected)],
      ["Undecided", String(summary.scope.maybe)],
      ["Total Process Steps", String(summary.steps.total)],
      ["Steps Reviewed", String(summary.steps.reviewed)],
      ["Steps Pending", String(summary.steps.pending)],
    ],
    theme: "grid",
    headStyles: aptusHeadStyles(),
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  y = advancePastTable(doc, y + 60, 12, 60);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Fit Analysis", 20, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Outcome", "Count", "% of total"]],
    body: [
      [outcomeLabel("FIT"),       String(summary.steps.fit),       `${ootbPct}%`],
      [outcomeLabel("CONFIGURE"), String(summary.steps.configure), `${cfgPct}%`],
      ["Needs work",              String(summary.steps.gap),       `${gapPct}%`],
      ["Not applicable",          String(summary.steps.na),
        `${summary.steps.total > 0 ? Math.round((summary.steps.na / summary.steps.total) * 100) : 0}%`],
    ],
    theme: "grid",
    headStyles: aptusHeadStyles(),
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  y = advancePastTable(doc, y + 50, 12, 70);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Gap Resolution", 20, y);
  y += 8;

  // Translate raw resolutionType keys → plain-language labels
  const gapRows: string[][] = Object.entries(summary.gaps.byType).map(([rt, count]) => [
    isResolutionType(rt) ? outcomeLabel(rt) : rt,
    String(count),
  ]);
  gapRows.push(["Total Gaps", String(summary.gaps.total)]);
  gapRows.push(["Resolved", String(summary.gaps.resolved)]);
  gapRows.push(["Estimated Effort (days)", String(summary.gaps.totalEffortDays)]);

  autoTable(doc, {
    startY: y,
    head: [["Resolution type", "Count"]],
    body: gapRows,
    theme: "grid",
    headStyles: aptusHeadStyles(),
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  // ── Page 3: Configuration Activities + sign-off line ────────────────
  y = advancePastTable(doc, y + 30, 12, 60);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Configuration Activities", 20, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(82, 82, 91);
  doc.text(
    `${summary.config.total} configuration activities for selected scope items.`,
    20, y,
  );

  // Sign-off line, bottom of last page
  const phLast = doc.internal.pageSize.getHeight();
  const sigY = phLast - 40;
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.1);
  doc.line(20, sigY, doc.internal.pageSize.getWidth() - 20, sigY);
  doc.setFontSize(8);
  doc.setTextColor(82, 82, 91);
  doc.text("PREPARED BY", 20, sigY + 6);
  doc.text("APPROVED BY", 80, sigY + 6);
  doc.text("DATE", 140, sigY + 6);
  doc.setDrawColor(11, 11, 15);
  doc.setLineWidth(0.3);
  doc.line(20,  sigY + 18, 70,  sigY + 18);
  doc.line(80,  sigY + 18, 130, sigY + 18);
  doc.line(140, sigY + 18, 190, sigY + 18);

  renderFooterOnAllPages(doc, "01_Executive_Summary.pdf");
  return new Uint8Array(doc.output("arraybuffer"));
}

// ── Generator: 02_Effort_Estimate.pdf ────────────────────────────────────────

export function generateEffortEstimatePdf(
  summary: ReportSummary,
  gapData: Array<{ resolutionType: string; effortDays: number; riskLevel: string }>,
  branding?: BrandingConfig | undefined,
): Uint8Array {
  const b = branding ?? DEFAULT_BRANDING;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── Page 1: Cover ───────────────────────────────────────────────────
  renderCover(doc, b, "Effort Estimate", summary.assessment.companyName);
  renderCoverMeta(doc, [
    ["Industry", summary.assessment.industry],
    ["Country", summary.assessment.country],
    ["Company size", summary.assessment.companySize],
    ["Report date", summary.assessment.updatedAt.toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    })],
    ["Prepared by", "ABeam Consulting"],
  ]);
  renderCoverLead(doc,
    `Bottom-up effort estimate derived from ${summary.gaps.total} gap items and ${summary.config.total} configuration activities. ` +
    "Estimates use industry-standard heuristics by resolution type. Excludes infrastructure provisioning, training material development, and post-go-live support beyond standard hypercare.",
  );

  // ── Page 2: Effort by resolution type + phase breakdown ─────────────
  doc.addPage();
  let y = 25;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 11, 15);
  doc.text("Effort by Resolution Type", 20, y);
  y += 8;

  // Aggregate by resolution type, translate to plain-language labels
  const effortByType: Record<string, { count: number; days: number }> = {};
  for (const g of gapData) {
    const key = g.resolutionType;
    if (!effortByType[key]) effortByType[key] = { count: 0, days: 0 };
    effortByType[key].count++;
    effortByType[key].days += g.effortDays;
  }
  const effortRows = Object.entries(effortByType).map(([rt, agg]) => [
    isResolutionType(rt) ? outcomeLabel(rt) : rt,
    String(agg.count),
    agg.count > 0 ? (agg.days / agg.count).toFixed(1) : "0.0",
    String(agg.days),
  ]);
  effortRows.push(["Total", String(gapData.length), "—", String(summary.gaps.totalEffortDays)]);

  autoTable(doc, {
    startY: y,
    head: [["Resolution type", "Count", "Avg days / item", "Total days"]],
    body: effortRows,
    theme: "grid",
    headStyles: aptusHeadStyles(),
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  y = advancePastTable(doc, y + 40, 12, 80);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Phase Breakdown", 20, y);
  y += 8;

  // Stacked bar (24mm tall) — monochrome
  const totalDays = summary.gaps.totalEffortDays || 1;
  const phases = [
    { label: "Implementation",   pct: 0.30, color: rgb("#0B0B0F") },
    { label: "Configuration",    pct: 0.25, color: rgb("#3F3F46") },
    { label: "Extensions",       pct: 0.20, color: rgb("#52525B") },
    { label: "Testing",          pct: 0.15, color: rgb("#71717A") },
    { label: "Training",         pct: 0.10, color: rgb("#A1A1AA") },
  ];
  const barWidth = doc.internal.pageSize.getWidth() - 40;
  let xCursor = 20;
  for (const p of phases) {
    const w = barWidth * p.pct;
    doc.setFillColor(p.color[0], p.color[1], p.color[2]);
    doc.rect(xCursor, y, w, 24, "F");
    if (w > 24) {
      doc.setTextColor(p.label === "Training" ? 11 : 255, p.label === "Training" ? 11 : 255, p.label === "Training" ? 15 : 255);
      doc.setFontSize(9);
      doc.text(`${p.label} ${Math.round(p.pct * 100)}%`, xCursor + w / 2, y + 14, { align: "center" });
    }
    xCursor += w;
  }
  y += 30;

  autoTable(doc, {
    startY: y,
    head: [["Phase", "% of total", "Days"]],
    body: phases.map((p) => [
      p.label,
      `${Math.round(p.pct * 100)}%`,
      String(Math.round(totalDays * p.pct)),
    ]).concat([["Total", "100%", String(summary.gaps.totalEffortDays)]]),
    theme: "grid",
    headStyles: aptusHeadStyles(),
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });

  // ── Page 3: Confidence + assumptions ────────────────────────────────
  y = advancePastTable(doc, y + 50, 12, 80);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 11, 15);
  doc.text("Confidence Assessment", 20, y);
  y += 10;

  const reviewedPct = summary.steps.total > 0
    ? Math.round((summary.steps.reviewed / summary.steps.total) * 100)
    : 0;
  const confidence: DotTier = reviewedPct >= 90 ? "success" : reviewedPct >= 60 ? "warning" : "danger";
  const confLabel = reviewedPct >= 90 ? "HIGH" : reviewedPct >= 60 ? "MEDIUM" : "LOW";
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Steps reviewed: ${reviewedPct}%   →   Confidence:`, 20, y);
  drawPill(doc, 92, y, confLabel, confidence);

  y += 12;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Assumptions", 20, y);
  y += 8;

  const assumptions = [
    "Effort estimates use industry-standard heuristics by resolution type: Trusted add-on 5d, Adapt to SAP 3d, Cloud add-on 8d, Custom build 12d, Power-user extension 2d, Out of scope 0d.",
    "Phase split is indicative; actual will vary by complexity and team velocity.",
    "Excludes infrastructure provisioning, environment setup, and SAP licence procurement.",
    "Excludes training material development beyond a baseline role-based curriculum.",
    "Excludes post-go-live hypercare beyond the standard 4-week period.",
  ];
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(11, 11, 15);
  for (const a of assumptions) {
    const lines = doc.splitTextToSize(`•  ${a}`, doc.internal.pageSize.getWidth() - 40) as string[];
    doc.text(lines, 20, y);
    y += lines.length * 5 + 1;
  }

  renderFooterOnAllPages(doc, "02_Effort_Estimate.pdf");
  return new Uint8Array(doc.output("arraybuffer"));
}

// ── Generator: 03_Readiness_Scorecard.pdf ────────────────────────────────────

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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();

  // ── Page 1: Cover + GO/CONDITIONAL/NO-GO headline ───────────────────
  renderCover(doc, b, "Readiness Scorecard", companyName);
  renderCoverMeta(doc, [
    ["Client", companyName],
    ["Report date", new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    })],
    ["Prepared by", "ABeam Consulting"],
  ]);
  renderCoverLead(doc,
    "Cross-category readiness assessment scored on a 0–100 scale. Combines process fit, " +
    "data preparedness, integration complexity, change-management readiness, and technology " +
    "landscape into an overall recommendation.",
  );

  // Headline label — bottom-anchored
  const ph = doc.internal.pageSize.getHeight();
  const hlTop = ph - 22 - 60;
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.2);
  doc.rect(20, hlTop, pw - 40, 56);

  const labelMap: Record<string, { text: string; tier: DotTier; color: [number, number, number] }> = {
    go:             { text: "GO",             tier: "success", color: rgb(DOT_HEX.success) },
    conditional_go: { text: "CONDITIONAL GO", tier: "warning", color: rgb(DOT_HEX.warning) },
    no_go:          { text: "NO GO",          tier: "danger",  color: rgb(DOT_HEX.danger) },
  };
  const verdict = labelMap[scorecard.goNoGo] ?? { text: scorecard.goNoGo.toUpperCase(), tier: "neutral" as DotTier, color: rgb(DOT_HEX.neutral) };

  // Centered label rectangle
  const labelW = 80;
  const labelX = (pw - labelW) / 2;
  doc.setFillColor(verdict.color[0], verdict.color[1], verdict.color[2]);
  doc.rect(labelX, hlTop + 12, labelW, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(verdict.text, pw / 2, hlTop + 21, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor(11, 11, 15);
  doc.text(`${scorecard.overallScore} / 100`, pw / 2, hlTop + 36, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(82, 82, 91);
  const sumLines = doc.splitTextToSize(scorecard.executiveSummary, pw - 80) as string[];
  doc.text(sumLines.slice(0, 2), pw / 2, hlTop + 46, { align: "center" });

  // ── Page 2: Overall score table + scoring scale ─────────────────────
  doc.addPage();
  let y = 25;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 11, 15);
  doc.text("Overall Score", 20, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Category", "Score", "Status"]],
    body: scorecard.categories.map((c) => [
      c.category,
      `${c.score} / 100`,
      c.status.toUpperCase(),
    ]),
    theme: "grid",
    headStyles: aptusHeadStyles(),
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "center" } },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 2) {
        const val = String(data.cell.raw);
        if (val === "GREEN") data.cell.styles.textColor = rgb(DOT_HEX.success);
        if (val === "AMBER") data.cell.styles.textColor = rgb(DOT_HEX.warning);
        if (val === "RED")   data.cell.styles.textColor = rgb(DOT_HEX.danger);
      }
    },
  });

  y = advancePastTable(doc, y + 50, 12, 60);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Scoring Scale", 20, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Range", "Verdict", "Meaning"]],
    body: [
      ["85–100", "Go", "Proceed without conditions. All categories ready."],
      ["60–84", "Conditional Go", "Proceed with explicit mitigation plan for amber categories."],
      ["0–59", "No Go", "Defer kickoff. Address the gaps and re-run the assessment before resuming."],
    ],
    theme: "grid",
    headStyles: aptusHeadStyles(),
    margin: { left: 20, right: 20 },
    styles: { fontSize: 9 },
  });

  // ── Pages 3+: Per-category findings + recommendations ───────────────
  for (const cat of scorecard.categories) {
    doc.addPage();
    y = 25;

    // Category header with score-pill on right
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(11, 11, 15);
    doc.text(cat.category, 20, y);
    const tier: DotTier = cat.status === "GREEN" ? "success" : cat.status === "AMBER" ? "warning" : cat.status === "RED" ? "danger" : "neutral";
    drawPill(doc, pw - 60, y, `${cat.score} / 100`, tier);
    y += 4;
    doc.setDrawColor(11, 11, 15);
    doc.setLineWidth(0.3);
    doc.line(20, y, pw - 20, y);
    y += 8;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Findings", 20, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    for (const f of cat.findings) {
      const lines = doc.splitTextToSize(`•  ${f}`, pw - 40) as string[];
      doc.text(lines, 20, y);
      y += lines.length * 5 + 1;
    }

    y += 4;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Recommendations", 20, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    for (let i = 0; i < cat.recommendations.length; i++) {
      const lines = doc.splitTextToSize(`${i + 1}.  ${cat.recommendations[i]}`, pw - 40) as string[];
      doc.text(lines, 20, y);
      y += lines.length * 5 + 1;
    }
  }

  renderFooterOnAllPages(doc, "03_Readiness_Scorecard.pdf");
  return new Uint8Array(doc.output("arraybuffer"));
}

// ── Generator: 04_Requirements_Findings.pdf (NEW) ────────────────────────────

export interface FindingsAreaSummary {
  area: string;
  total: number;
  byOutcome: Partial<Record<ResolutionType, number>>;
  cards: Array<{
    reqId: string;
    yourAsk: string;
    whatSapDoes: string;
    resolutionType: ResolutionType;
  }>;
}

export interface FindingsData {
  assessment: {
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
    updatedAt: Date;
  };
  totals: {
    total: number;
    byOutcome: Partial<Record<ResolutionType, number>>;
  };
  byArea: FindingsAreaSummary[];
}

export function generateRequirementsFindingsPdf(
  data: FindingsData,
  branding?: BrandingConfig | undefined,
): Uint8Array {
  const b = branding ?? DEFAULT_BRANDING;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();

  // ── Page 1: Cover ───────────────────────────────────────────────────
  renderCover(doc, b, "Requirements Findings", "Findings on every requirement you submitted");
  renderCoverMeta(doc, [
    ["Client", data.assessment.companyName],
    ["Industry", data.assessment.industry],
    ["Country", data.assessment.country],
    ["Requirements assessed", `${data.totals.total} across ${data.byArea.length} functional areas`],
    ["Report date", data.assessment.updatedAt.toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    })],
    ["Prepared by", "ABeam Consulting"],
  ]);
  renderCoverLead(doc,
    `You sent us ${data.totals.total} requirements. We assessed every single one against ` +
    "standard SAP S/4HANA — SAP's new-generation business platform. This document closes the loop: " +
    "for each requirement, in your own ID and your own wording, we tell you what we found — in plain " +
    "English, with the reasoning. There is a glossary on page 2 so nothing reads as jargon.",
  );

  // ── Page 2: Glossary (the §2.5 table) ───────────────────────────────
  doc.addPage();
  let y = 25;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 11, 15);
  doc.text("How to read this report", 20, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Throughout this document we use plain-language labels for SAP concepts. Here's the dictionary so nothing reads as jargon.",
    20, y,
  );
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["SAP / consulting term", "Plain-language label", "Explanation"]],
    body: GLOSSARY_ENTRIES.map((e) => [e.term, e.label, e.explanation]),
    theme: "grid",
    headStyles: aptusHeadStyles(),
    margin: { left: 20, right: 20 },
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 36, fontStyle: "italic" },
      1: { cellWidth: 36, fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  });

  // ── Page 3: Your requirements at a glance ───────────────────────────
  doc.addPage();
  y = 25;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 11, 15);
  doc.text("Your requirements at a glance", 20, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`You sent us ${data.totals.total} requirements across ${data.byArea.length} functional areas.`, 20, y);
  y += 10;

  // 4 big-number cells: Standard SAP / Configurable / Adapt / Needs work
  const standardSAP = data.totals.byOutcome.FIT ?? 0;
  const configurable = data.totals.byOutcome.CONFIGURE ?? 0;
  const adapt = data.totals.byOutcome.ADAPT_PROCESS ?? 0;
  const needsWork = (data.totals.byOutcome.ISV ?? 0)
    + (data.totals.byOutcome.KEY_USER_EXT ?? 0)
    + (data.totals.byOutcome.BTP_EXT ?? 0)
    + (data.totals.byOutcome.CUSTOM_ABAP ?? 0);
  const total = data.totals.total || 1;
  const cellW = (pw - 40 - 18) / 4;
  const cells = [
    { num: standardSAP,  label: "Standard SAP",  tier: "success" as DotTier, sub: `${Math.round(standardSAP / total * 100)}% — nothing to build.` },
    { num: configurable, label: "Configurable",  tier: "warning" as DotTier, sub: `${Math.round(configurable / total * 100)}% — our team configures.` },
    { num: adapt,        label: "Adapt to SAP",  tier: "warning" as DotTier, sub: `${Math.round(adapt / total * 100)}% — adjust process.` },
    { num: needsWork,    label: "Needs work",    tier: "info"    as DotTier, sub: `${Math.round(needsWork / total * 100)}% — broken down below.` },
  ];
  for (let i = 0; i < cells.length; i++) {
    const x = 20 + i * (cellW + 6);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.2);
    doc.rect(x, y, cellW, 30);
    const c = cells[i]!;
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(11, 11, 15);
    doc.text(String(c.num), x + 4, y + 11);
    drawPill(doc, x + 4, y + 19, c.label, c.tier);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(82, 82, 91);
    const subLines = doc.splitTextToSize(c.sub, cellW - 8) as string[];
    doc.text(subLines, x + 4, y + 25);
  }
  y += 38;

  // Bottom-line callout
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(11, 11, 15);
  doc.setLineWidth(1.0);
  doc.rect(20, y, pw - 40, 14, "FD");
  // Left accent bar
  doc.setFillColor(11, 11, 15);
  doc.rect(20, y, 1.5, 14, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(11, 11, 15);
  const fitConfigPct = Math.round((standardSAP + configurable) / total * 100);
  const callout = `Bottom line: SAP covers ${fitConfigPct}% of what you asked for with no new code. The remaining ${100 - fitConfigPct}% is handled with a mix of trusted add-ons and minimal custom development.`;
  const calloutLines = doc.splitTextToSize(callout, pw - 50) as string[];
  doc.text(calloutLines, 24, y + 5);

  // ── Pages 4 to N: One section per area, with finding cards ──────────
  for (const area of data.byArea) {
    doc.addPage();
    y = 25;

    // Area summary box
    doc.setDrawColor(11, 11, 15);
    doc.setLineWidth(0.8);
    doc.line(20, y - 2, pw - 20, y - 2);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(11, 11, 15);
    doc.text(area.area, 20, y + 4);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(82, 82, 91);
    doc.text(`${area.total} requirements`, pw - 20, y + 4, { align: "right" });
    y += 10;
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.1);
    doc.line(20, y, pw - 20, y);
    y += 8;

    // Per-area headline
    const areaFitPct = area.total > 0
      ? Math.round(((area.byOutcome.FIT ?? 0) + (area.byOutcome.CONFIGURE ?? 0)) / area.total * 100)
      : 0;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(11, 11, 15);
    const headline = `Headline: ${areaFitPct}% of your ${area.area.toLowerCase()} requirements are met by standard SAP or configuration.`;
    const hLines = doc.splitTextToSize(headline, pw - 40) as string[];
    doc.text(hLines, 20, y);
    y += hLines.length * 5 + 6;

    // Finding cards (up to 4 per page)
    for (const card of area.cards.slice(0, 4)) {
      if (y + 50 > doc.internal.pageSize.getHeight() - 22) {
        doc.addPage();
        y = 25;
      }
      drawFindingCard(doc, 20, y, pw - 40, card);
      y += 50;
    }
  }

  // ── Last page: Why we recommend what we recommend ───────────────────
  doc.addPage();
  y = 25;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 11, 15);
  doc.text("Why we recommend what we recommend", 20, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const intro = doc.splitTextToSize(
    "SAP's design philosophy is \"configure, don't customize.\" Every line of custom code creates future maintenance burden, upgrade risk, and dependency on the developer who wrote it.",
    pw - 40,
  ) as string[];
  doc.text(intro, 20, y);
  y += intro.length * 6;

  y += 4;
  doc.text("So when we evaluate each of your requirements, we follow this hierarchy:", 20, y);
  y += 8;

  const hierarchy = [
    ["1.", "Can SAP do this as standard?", "Use it. Cheapest, safest, upgrade-friendly."],
    ["2.", "Can we configure SAP to do this?", "Configure it. Still upgrade-safe, no code."],
    ["3.", "Can your process adapt to SAP best practice?", "Recommend the adaptation. Often improves the process; certainly cheaper to maintain."],
    ["4.", "Is there a trusted add-on?", "Use the add-on. Maintained by the vendor; your team doesn't carry the support burden."],
    ["5.", "Can a power user build it?", "Empower the user. SAP's no-code tools are mature."],
    ["6.", "Last resort: custom build.", "Build it carefully. Reserved for genuine competitive differentiation."],
  ];
  for (const [num, q, a] of hierarchy) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${num}  ${q}`, 24, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(82, 82, 91);
    const aLines = doc.splitTextToSize(`→  ${a}`, pw - 50) as string[];
    doc.text(aLines, 30, y);
    doc.setTextColor(11, 11, 15);
    y += aLines.length * 5 + 4;
  }

  y += 4;
  doc.setDrawColor(228, 228, 231);
  doc.line(20, y, pw - 20, y);
  y += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(11, 11, 15);
  const closer = doc.splitTextToSize(
    "This is why most of your requirements land in categories 1–2. That isn't us being lazy — that's us protecting your investment in SAP for the next 10 years.",
    pw - 40,
  ) as string[];
  doc.text(closer, 20, y);

  renderFooterOnAllPages(doc, "04_Requirements_Findings.pdf");
  return new Uint8Array(doc.output("arraybuffer"));
}

/** Render a single finding card — header (Req ID + outcome pill), then 3
 * labelled rows: Your ask / What SAP does / What it means for you. */
function drawFindingCard(
  doc: jsPDF,
  x: number, y: number, w: number,
  card: { reqId: string; yourAsk: string; whatSapDoes: string; resolutionType: ResolutionType },
): void {
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, 47);

  // Header row
  doc.setFontSize(9);
  doc.setFont("courier", "bold");
  doc.setTextColor(11, 11, 15);
  doc.text(card.reqId, x + 4, y + 6);

  const label = outcomeLabel(card.resolutionType);
  const tier = outcomeDot(card.resolutionType);
  // Place pill on the right
  doc.setFont("helvetica", "normal");
  const labelW = doc.getTextWidth(label) + 6;
  drawPill(doc, x + w - labelW - 4, y + 6, label, tier);

  // Hairline separator
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.1);
  doc.line(x + 4, y + 9, x + w - 4, y + 9);

  // Three rows
  doc.setFontSize(8);
  doc.setFont("courier", "normal");
  doc.setTextColor(82, 82, 91);
  doc.text("YOUR ASK", x + 4, y + 14);
  doc.text("WHAT SAP DOES", x + 4, y + 24);
  doc.text("WHAT IT MEANS", x + 4, y + 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(11, 11, 15);
  const valW = w - 38;
  doc.text(doc.splitTextToSize(card.yourAsk, valW) as string[], x + 36, y + 14);
  doc.text(doc.splitTextToSize(card.whatSapDoes, valW) as string[], x + 36, y + 24);
  doc.text(doc.splitTextToSize(outcomeMeans(card.resolutionType), valW) as string[], x + 36, y + 36);
}

// ── Generator: 13_Flow_Atlas.pdf ─────────────────────────────────────────────

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
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Cover (landscape — slightly different layout)
  const pw = doc.internal.pageSize.getWidth();
  const cover = brandColorRgb(b, "cover-band");
  doc.setFillColor(cover[0], cover[1], cover[2]);
  doc.rect(0, 0, pw, 60, "F");
  drawAptusMark(doc, 20, 18, 5);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Aptus", 27, 22.5);
  doc.setFontSize(28);
  doc.text("Flow Atlas", 20, 42);
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(companyName, 20, 52);

  let y = 78;
  doc.setTextColor(11, 11, 15);
  doc.setFontSize(11);
  const totalSteps = diagrams.reduce((s, d) => s + d.stepCount, 0);
  const totalFit = diagrams.reduce((s, d) => s + d.fitCount, 0);
  const totalGap = diagrams.reduce((s, d) => s + d.gapCount, 0);
  const scopeIds = new Set(diagrams.map((d) => d.scopeItemId));
  doc.text(`Total Diagrams: ${diagrams.length}   |   Scope Items: ${scopeIds.size}   |   Total Steps: ${totalSteps}`, 20, y);
  y += 6;
  doc.text(`Standard SAP: ${totalFit}   |   Needs work: ${totalGap}   |   Fit Rate: ${totalSteps > 0 ? Math.round((totalFit / totalSteps) * 100) : 0}%`, 20, y);
  y += 14;

  // Status legend with status dots
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Status Legend", 20, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const legend: Array<[DotTier, string]> = [
    ["success", "Standard SAP — works as-is"],
    ["warning", "Configurable — needs setup"],
    ["danger",  "Needs work — gap requires resolution"],
    ["neutral", "Not applicable or pending"],
  ];
  for (const [tier, label] of legend) {
    drawPill(doc, 20, y, label, tier);
    y += 6;
  }

  // Per-diagram pages
  for (const d of diagrams) {
    doc.addPage();
    const tier: DotTier = d.gapCount > 0 ? "danger" : d.configureCount > 0 ? "warning" : "success";

    // Header rule + title
    doc.setTextColor(82, 82, 91);
    doc.setFontSize(10);
    doc.text(`${d.scopeItemId} › ${d.scopeItemName}`, 18, 18);
    doc.setTextColor(11, 11, 15);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(d.processFlowName, 18, 26);
    doc.setDrawColor(11, 11, 15);
    doc.setLineWidth(0.3);
    doc.line(18, 30, doc.internal.pageSize.getWidth() - 18, 30);

    // Footer line
    const phLand = doc.internal.pageSize.getHeight();
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(11, 11, 15);
    doc.text("Verdict:", 20, phLand - 22);
    drawPill(doc, 38, phLand - 22, tier === "success" ? "Standard SAP" : tier === "warning" ? "Configurable" : "Needs work", tier);
    doc.text(`Steps: ${d.stepCount}    Gaps: ${d.gapCount}`, 100, phLand - 22);
  }

  renderFooterOnAllPages(doc, "13_Flow_Atlas.pdf");
  return new Uint8Array(doc.output("arraybuffer"));
}

// ── Generator: 16_Sign_Off.pdf (NEW) ─────────────────────────────────────────

export interface SignOffData {
  assessment: {
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
    updatedAt: Date;
  };
  bundleHash: string;
}

export function generateSignOffPdf(
  data: SignOffData,
  branding?: BrandingConfig | undefined,
): Uint8Array {
  const b = branding ?? DEFAULT_BRANDING;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  // Page 1 — Cover
  renderCover(doc, b, "Sign-off", data.assessment.companyName);
  renderCoverMeta(doc, [
    ["Client", data.assessment.companyName],
    ["Industry", data.assessment.industry],
    ["Country", data.assessment.country],
    ["Report date", data.assessment.updatedAt.toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    })],
    ["Prepared by", "ABeam Consulting"],
  ]);
  renderCoverLead(doc,
    `Acceptance page for the SAP S/4HANA fit-to-standard assessment for ${data.assessment.companyName}. ` +
    "Two-signatory acceptance is required to baseline the assessment for project planning.",
  );

  // Page 2 — Sign-off page
  doc.addPage();
  let y = 25;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 11, 15);
  doc.text("Sign-off", 20, y);
  y += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const introLines = doc.splitTextToSize(
    `This document confirms that the SAP S/4HANA fit-to-standard assessment for ${data.assessment.companyName} ` +
    "has been reviewed and accepted as the basis for project planning.",
    pw - 40,
  ) as string[];
  doc.text(introLines, 20, y);
  y += introLines.length * 5 + 6;

  // Two-up signature blocks
  const blockW = (pw - 40 - 8) / 2;
  const blockH = 70;
  drawSignatureBlock(doc, 20,            y, blockW, blockH, "CLIENT SIGNATORY");
  drawSignatureBlock(doc, 20 + blockW + 8, y, blockW, blockH, "ABEAM SIGNATORY");

  // Bundle hash near the bottom
  const hashY = ph - 40;
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.1);
  doc.line(20, hashY, pw - 20, hashY);
  doc.setFontSize(8);
  doc.setTextColor(82, 82, 91);
  doc.text("Bundle hash (SHA-256) — proves the signed bundle hasn't been tampered with:", 20, hashY + 5);
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(11, 11, 15);
  doc.text(data.bundleHash, 20, hashY + 10);

  renderFooterOnAllPages(doc, "16_Sign_Off.pdf");
  return new Uint8Array(doc.output("arraybuffer"));
}

function drawSignatureBlock(
  doc: jsPDF, x: number, y: number, w: number, h: number, headerLabel: string,
): void {
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(82, 82, 91);
  doc.text(headerLabel, x + 6, y + 8);

  doc.setFont("helvetica", "normal");
  const fields = ["Name", "Title", "Signature", "Date"];
  let fy = y + 18;
  for (const field of fields) {
    doc.setFontSize(8);
    doc.setTextColor(82, 82, 91);
    doc.text(field, x + 6, fy);
    doc.setDrawColor(11, 11, 15);
    doc.setLineWidth(0.3);
    const lineY = field === "Signature" ? fy + 10 : fy + 6;
    doc.line(x + 6, lineY, x + w - 6, lineY);
    fy += field === "Signature" ? 16 : 12;
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const RESOLUTION_TYPE_VALUES: ReadonlySet<string> = new Set([
  "FIT", "CONFIGURE", "ADAPT_PROCESS", "ISV", "KEY_USER_EXT", "BTP_EXT", "CUSTOM_ABAP", "OUT_OF_SCOPE",
]);

function isResolutionType(s: string): s is ResolutionType {
  return RESOLUTION_TYPE_VALUES.has(s);
}

// Re-export brandColor / brandRole convenience for callers that want to draw
// custom chart accents using the client-accent override pattern.
export { brandColor, type BrandRole };
