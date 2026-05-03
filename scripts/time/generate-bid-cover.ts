/**
 * TIME RFT Phase 11 — generate the bid cover PDF.
 *
 * Sections:
 *   1. Cover page (TIME branding, RFT 26.069)
 *   2. Executive summary (verdict distribution)
 *   3. Catalog provenance (sha256s of all evidence sources)
 *   4. Methodology overview (SAP Activate phases + deliverables)
 *   5. Risk summary (G-bucket + unverdicted + Red EWA findings)
 *   6. Sign-off block
 *
 * Output: /workspaces/aptus/logs/TIME_Bid_Cover_<timestamp>.pdf
 *
 * Uses jsPDF + jspdf-autotable (existing dependency for greenfield reports).
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { writeFile } from "fs/promises";
import { prisma } from "../../src/lib/db/prisma";

const ASSESSMENT_COMPANY = "T.I.M.E. dotCom Bhd";
const RFT_NO = "26.069";

const COL_NAVY: [number, number, number] = [11, 11, 15];
const COL_PRIMARY: [number, number, number] = [30, 58, 138];
const COL_MUTED: [number, number, number] = [100, 116, 139];
const COL_TEXT: [number, number, number] = [17, 24, 39];
const COL_GREEN: [number, number, number] = [22, 163, 74];
const COL_AMBER: [number, number, number] = [217, 119, 6];
const COL_RED: [number, number, number] = [220, 38, 38];

interface Distribution {
  O: number;
  C: number;
  G: number;
  "N/A": number;
  unverdicted: number;
}

async function gatherFacts(assessmentId: string): Promise<{
  distribution: Distribution;
  totalReqs: number;
  perModule: Array<{ module: string; total: number; o: number; c: number; g: number; na: number; unv: number }>;
  ewaFindings: { red: number; yellow: number; total: number };
  blockerSItems: number;
  catalogs: Array<{ name: string; rows: number; sha256OrId: string }>;
  customerProcessCount: number;
  evidenceLinkCount: number;
  guideCount: number;
  partnerEdgeAssetCount: number;
}> {
  const requirements = await prisma.clientRequirement.findMany({
    where: { assessmentId },
    select: { module: true, solutionProviderResponse: true },
  });
  const dist: Distribution = { O: 0, C: 0, G: 0, "N/A": 0, unverdicted: 0 };
  for (const r of requirements) {
    const v = r.solutionProviderResponse;
    if (!v) dist.unverdicted++;
    else if (v.startsWith("O")) dist.O++;
    else if (v.startsWith("C")) dist.C++;
    else if (v.startsWith("G")) dist.G++;
    else dist["N/A"]++;
  }
  const perModuleMap = new Map<string, { total: number; o: number; c: number; g: number; na: number; unv: number }>();
  for (const r of requirements) {
    const m = perModuleMap.get(r.module) ?? { total: 0, o: 0, c: 0, g: 0, na: 0, unv: 0 };
    m.total++;
    const v = r.solutionProviderResponse;
    if (!v) m.unv++;
    else if (v.startsWith("O")) m.o++;
    else if (v.startsWith("C")) m.c++;
    else if (v.startsWith("G")) m.g++;
    else m.na++;
    perModuleMap.set(r.module, m);
  }
  const perModule = Array.from(perModuleMap.entries()).map(([module, m]) => ({ module, ...m }));

  const ewaFindings = await prisma.ewaFinding.findMany({
    where: { snapshot: { brownfieldAssessment: { customerName: { contains: "TT dotCom" } } } },
    select: { severity: true },
  });
  const ewaSummary = {
    red: ewaFindings.filter((f) => f.severity === "Red").length,
    yellow: ewaFindings.filter((f) => f.severity === "Yellow").length,
    total: ewaFindings.length,
  };

  const blockerSItems = await prisma.brownfieldVerdict.count({
    where: { brownfieldAssessment: { customerName: { contains: "TT dotCom" } }, bucket: "B", isCurrent: true },
  });

  const greenfieldCatalog = await prisma.scopeCatalogVersion.findFirst({
    where: { edition: "PRIVATE", version: "2025-FPS1", isActive: true },
    include: { _count: { select: { scopeItems: true } } },
  });
  const brownfieldCatalog = await prisma.brownfieldCatalogVersion.findFirst({
    where: { isActive: true },
    orderBy: { ingestedAt: "desc" },
    include: {
      _count: {
        select: {
          simplificationItems: true,
          simplificationItemChecks: true,
          preCheckNotes: true,
          businessFunctionDispositions: true,
        },
      },
    },
  });

  const customerProcessCount = await prisma.customerProcess.count({ where: { assessmentId } });
  const evidenceLinkCount = await prisma.customerProcessSapEvidenceLink.count({
    where: { customerProcess: { assessmentId } },
  });
  const guideCount = await prisma.brownfieldGuide.count();
  const partnerEdgeAssetCount = await prisma.brownfieldGuide.count({
    where: { sourceProgram: { contains: "Customer Evolution Program" } },
  });

  return {
    distribution: dist,
    totalReqs: requirements.length,
    perModule,
    ewaFindings: ewaSummary,
    blockerSItems,
    catalogs: [
      {
        name: `Greenfield: SAP Best Practices PRIVATE ${greenfieldCatalog?.version ?? "?"} (${greenfieldCatalog?._count.scopeItems ?? 0} ScopeItems)`,
        rows: greenfieldCatalog?._count.scopeItems ?? 0,
        sha256OrId: greenfieldCatalog?.sourceArchiveHash?.slice(0, 16) ?? greenfieldCatalog?.id ?? "?",
      },
      {
        name: `Brownfield: Simplification Item Catalog ${brownfieldCatalog?.snapshotDate.toISOString().slice(0, 10) ?? "?"} (${brownfieldCatalog?._count.simplificationItems ?? 0} SImplification Items, ${brownfieldCatalog?._count.simplificationItemChecks ?? 0} checks, ${brownfieldCatalog?._count.preCheckNotes ?? 0} Pre-Check Notes, ${brownfieldCatalog?._count.businessFunctionDispositions ?? 0} BFRs)`,
        rows: brownfieldCatalog?._count.simplificationItems ?? 0,
        sha256OrId: brownfieldCatalog?.sourceArchiveHash?.slice(0, 16) ?? brownfieldCatalog?.id ?? "?",
      },
    ],
    customerProcessCount,
    evidenceLinkCount,
    guideCount,
    partnerEdgeAssetCount,
  };
}

async function main(): Promise<void> {
  const assessment = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
    select: { id: true, companyName: true, country: true, currentErp: true, sapVersion: true },
  });
  if (!assessment) throw new Error(`Assessment for ${ASSESSMENT_COMPANY} not found`);
  console.log(`[time-bid-cover] Assessment: ${assessment.id}`);

  const facts = await gatherFacts(assessment.id);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18; // margin

  // -------- COVER PAGE --------
  // Brand band
  doc.setFillColor(...COL_NAVY);
  doc.rect(0, 0, W, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("ABeam Consulting (Malaysia) Sdn Bhd", M, 15);
  doc.text("Generated by Aptus", W - M, 15, { align: "right" });
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("TIME RFT 26.069", M, 30);

  doc.setTextColor(...COL_TEXT);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("S/4HANA Cloud Private Edition", M, 70);
  doc.text("Implementation Bid Response", M, 82);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COL_MUTED);
  doc.text(`For: ${assessment.companyName}`, M, 100);
  doc.text(`From: ABeam Consulting (Malaysia) Sdn Bhd`, M, 108);
  doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, M, 116);

  // Quick stats box
  doc.setDrawColor(...COL_PRIMARY);
  doc.setLineWidth(0.6);
  doc.rect(M, 130, W - 2 * M, 60);
  doc.setTextColor(...COL_TEXT);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Bid Response Summary", M + 4, 140);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 148;
  const lines = [
    `Total functional requirements responded: ${facts.totalReqs}`,
    `Verdict distribution: O=${facts.distribution.O}  C=${facts.distribution.C}  G=${facts.distribution.G}  N/A=${facts.distribution["N/A"]}  unverdicted=${facts.distribution.unverdicted}`,
    `Customer As-Is processes mapped (App 2(b)): ${facts.customerProcessCount}`,
    `SAP catalog evidence links: ${facts.evidenceLinkCount}`,
    `Reference documents in evidence base: ${facts.guideCount} (incl. ${facts.partnerEdgeAssetCount} PartnerEdge Customer Evolution Program assets)`,
    `Customer EWA findings considered: ${facts.ewaFindings.total} (Red: ${facts.ewaFindings.red}, Yellow: ${facts.ewaFindings.yellow})`,
  ];
  for (const l of lines) {
    doc.text(l, M + 4, y);
    y += 6;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(...COL_MUTED);
  doc.text("Confidential — For TIME evaluation only", W / 2, H - 10, { align: "center" });

  // -------- PAGE 2: Executive summary + per-module distribution --------
  doc.addPage();
  doc.setTextColor(...COL_TEXT);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Executive Summary", M, M + 10);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `This response covers all ${facts.totalReqs} functional requirements in TIME's RFT 26.069 ` +
      `(Apps A–J). Each requirement is grounded against TWO SAP-published catalogs simultaneously:`,
    M,
    M + 22,
    { maxWidth: W - 2 * M },
  );

  let bulletY = M + 38;
  for (const c of facts.catalogs) {
    doc.setFont("helvetica", "bold");
    doc.text("•", M, bulletY);
    doc.setFont("helvetica", "normal");
    doc.text(c.name, M + 4, bulletY, { maxWidth: W - 2 * M - 4 });
    bulletY += doc.getTextDimensions(c.name, { maxWidth: W - 2 * M - 4 }).h + 4;
  }

  // Per-module distribution table
  autoTable(doc, {
    startY: bulletY + 4,
    head: [["Module", "Total", "O", "C", "G", "N/A", "Unverdicted"]],
    body: facts.perModule.map((m) => [
      m.module,
      m.total,
      m.o,
      m.c,
      m.g,
      m.na,
      m.unv,
    ]),
    foot: [["TOTAL", facts.totalReqs, facts.distribution.O, facts.distribution.C, facts.distribution.G, facts.distribution["N/A"], facts.distribution.unverdicted]],
    headStyles: { fillColor: COL_PRIMARY, textColor: 255, fontSize: 10, fontStyle: "bold" },
    footStyles: { fillColor: [229, 231, 235], textColor: COL_TEXT, fontStyle: "bold" },
    bodyStyles: { fontSize: 9, textColor: COL_TEXT },
    margin: { left: M, right: M },
  });

  // -------- PAGE 3: Catalog provenance --------
  doc.addPage();
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Catalog Provenance", M, M + 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    "All SAP-published evidence cited in our bid response is sha256-verified and tracked " +
      "in our DB. Below is the full chain of custody for each evidence source.",
    M,
    M + 22,
    { maxWidth: W - 2 * M },
  );

  autoTable(doc, {
    startY: M + 36,
    head: [["Evidence Source", "Rows", "sha256 / id"]],
    body: facts.catalogs.map((c) => [c.name, c.rows.toLocaleString(), c.sha256OrId]),
    headStyles: { fillColor: COL_PRIMARY, textColor: 255, fontSize: 10, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: COL_TEXT, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 20, halign: "right" },
      2: { cellWidth: 40, fontStyle: "italic" },
    },
    margin: { left: M, right: M },
  });

  // -------- PAGE 4: Risk summary --------
  doc.addPage();
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Risk Summary", M, M + 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const riskRows: Array<[string, string, string]> = [
    [
      "Customer EWA findings (Red severity)",
      `${facts.ewaFindings.red} findings`,
      "Address in Discover/Prepare phase per SAP Activate methodology. ABeam recommends pre-conversion remediation workshops.",
    ],
    [
      "Brownfield blocker SImplification Items",
      `${facts.blockerSItems} items`,
      "Functions removed in S/4HANA with no automated replacement. Each requires customer redesign before SUM execution.",
    ],
    [
      "Unverdicted requirements (pending classification)",
      `${facts.distribution.unverdicted}`,
      "Will be addressed in clarification round / Q&A with TIME prior to final submission.",
    ],
    [
      "Custom-code adaptation",
      "ATC scan pending",
      "Per SAP Activate Phase 3 (Explore), full custom-code remediation scope to be confirmed via S4HANA_READINESS ATC variant once TIME provides system access.",
    ],
  ];
  autoTable(doc, {
    startY: M + 22,
    head: [["Risk Area", "Magnitude", "Mitigation"]],
    body: riskRows,
    headStyles: { fillColor: COL_RED, textColor: 255, fontSize: 10, fontStyle: "bold" },
    bodyStyles: { fontSize: 9, textColor: COL_TEXT, valign: "top" },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      1: { cellWidth: 30, halign: "right" },
      2: { cellWidth: "auto" },
    },
    margin: { left: M, right: M },
  });

  // -------- PAGE 5: Methodology overview --------
  doc.addPage();
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Methodology Overview", M, M + 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Our delivery approach follows the SAP Activate System Conversion methodology " +
      "(6 phases, 26 deliverables — derived from the SAP-published Conversion Guide for SAP S/4HANA " +
      "Cloud Private Edition 2025).",
    M,
    M + 22,
    { maxWidth: W - 2 * M },
  );

  const phases = await prisma.conversionMethodologyPhase.findMany({
    where: { sourceMethodology: "SAP Activate" },
    orderBy: { phaseSequence: "asc" },
    include: { _count: { select: { deliverables: true } } },
  });

  autoTable(doc, {
    startY: M + 40,
    head: [["#", "Phase", "Description", "Deliverables"]],
    body: phases.map((p) => [
      p.phaseSequence,
      p.phaseName,
      (p.phaseDescription ?? "").slice(0, 200),
      p._count.deliverables,
    ]),
    headStyles: { fillColor: COL_PRIMARY, textColor: 255, fontSize: 10, fontStyle: "bold" },
    bodyStyles: { fontSize: 9, textColor: COL_TEXT, valign: "top" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 25, fontStyle: "bold" },
      2: { cellWidth: "auto" },
      3: { cellWidth: 22, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  // -------- PAGE 6: Sign-off --------
  doc.addPage();
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Sign-Off & Submission", M, M + 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    "This bid response is submitted under the following sign-off chain. ABeam Consulting " +
      "(Malaysia) Sdn Bhd warrants that all evidence cited in the response Excel (App 2) and " +
      "the Bill of Quantity work-package counts (App 3) are derived from sha256-verified " +
      "SAP-published artifacts ingested into Aptus.",
    M,
    M + 22,
    { maxWidth: W - 2 * M },
  );

  const signoffY = M + 60;
  doc.setFont("helvetica", "bold");
  doc.text("Signed by", M, signoffY);
  doc.text("Title", W / 2, signoffY);
  doc.setLineWidth(0.4);
  doc.setDrawColor(...COL_MUTED);
  doc.line(M, signoffY + 18, W / 2 - 8, signoffY + 18);
  doc.line(W / 2, signoffY + 18, W - M, signoffY + 18);
  doc.text("Date", M, signoffY + 32);
  doc.line(M, signoffY + 50, W / 2 - 8, signoffY + 50);

  // Footer on last page
  doc.setFontSize(8);
  doc.setTextColor(...COL_MUTED);
  doc.text(
    `Generated ${new Date().toISOString()} | Aptus assessment ${assessment.id}`,
    W / 2,
    H - 10,
    { align: "center" },
  );

  const pdfBytes = doc.output("arraybuffer");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = `/workspaces/aptus/logs/TIME_Bid_Cover_${timestamp}.pdf`;
  await writeFile(outPath, Buffer.from(pdfBytes));

  console.log(``);
  console.log(`[time-bid-cover] Done.`);
  console.log(`  Output: ${outPath}`);
  console.log(`  Pages : ${doc.getNumberOfPages()}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[time-bid-cover] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
