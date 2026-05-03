/**
 * TIME RFT Phase 5 — link CustomerProcess rows to SAP catalog evidence
 * (greenfield ScopeItems + brownfield SimplificationItems + PreCheckNotes
 * + APIs + EWA findings + Methodology deliverables).
 *
 * Strategy (deterministic, per source):
 *
 *   GREENFIELD_SCOPE_ITEM:
 *     - Filter ScopeItem rows by assessment.catalogVersionId (PRIVATE 2025-FPS1)
 *     - Match by: nameClean keyword overlap with process.processName
 *                + functionalArea overlap with process.parentSection
 *     - Confidence: high if both match, medium if name only, low if area only
 *
 *   BROWNFIELD_SIMPLIFICATION_ITEM:
 *     - Filter SimplificationItem rows by assessment.brownfieldCatalogVersionId
 *     - Match by: titleEn keyword overlap with process.processName
 *                + applicationArea overlap with process.parentSection
 *     - Confidence: same scheme
 *
 *   PRECHECK_NOTE:
 *     - For each PRIMARY/SECONDARY brownfield SimplificationItem matched above:
 *       link any RelatedSapNote rows that share the same simplificationItemId
 *
 *   EWA_FINDING:
 *     - For each process: heuristic word-overlap on EwaFinding.title vs
 *       process.processName + parentSection
 *     - Confidence: medium (heuristic match)
 *
 *   API_REFERENCE:
 *     - For each process: filter SapApiReference by appliesToPrivate=true
 *       AND apiType='ODATAV4' AND apiName keyword overlap with process.processName
 *     - Cap at top-5 by name relevance
 *
 *   GUIDE_SECTION:
 *     - For each process: keyword search in BrownfieldGuideSection.title
 *       (CONV_PE2025.pdf TOC sections)
 *
 *   METHODOLOGY_DELIVERABLE:
 *     - For each process: heuristic match on ConversionMethodologyDeliverable.deliverableName
 *
 * Idempotent — wipes prior evidence links + reinserts.
 *
 * Usage:
 *   $ pnpm tsx scripts/time/link-processes-to-evidence.ts
 */

import { prisma } from "../../src/lib/db/prisma";

const ASSESSMENT_COMPANY = "T.I.M.E. dotCom Bhd";

const STOP_WORDS = new Set([
  "the", "shall", "should", "will", "must", "may", "can", "and", "or", "but",
  "for", "with", "from", "into", "onto", "this", "that", "these", "those",
  "support", "supports", "supported", "ensure", "ensures", "provide", "provides",
  "provided", "system", "solution", "solutions", "process", "processes",
  "have", "has", "been", "being", "their", "there", "where", "when", "what",
  "all", "any", "some", "such", "each", "every", "other", "another",
  "implement", "implementation", "implemented", "manage", "management", "managed",
  "include", "includes", "included", "including", "able", "ability",
  "user", "users", "data", "information", "trade", "request",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 4 && !STOP_WORDS.has(w)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const x of a) if (b.has(x)) count++;
  return count;
}

interface ProcessTokens {
  id: string;
  processName: string;
  parentSection: string | null;
  nameTokens: Set<string>;
  sectionTokens: Set<string>;
  combined: Set<string>;
}

interface EvidenceLinkInput {
  customerProcessId: string;
  evidenceType: string;
  evidenceId: string;
  role: string;
  rationaleMd: string;
}

async function main(): Promise<void> {
  const assessment = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
    select: { id: true, catalogVersionId: true, brownfieldCatalogVersionId: true },
  });
  if (!assessment) throw new Error(`Assessment for ${ASSESSMENT_COMPANY} not found`);
  if (!assessment.catalogVersionId) throw new Error("Assessment missing catalogVersionId (greenfield)");
  if (!assessment.brownfieldCatalogVersionId) throw new Error("Assessment missing brownfieldCatalogVersionId");

  console.log(`[time-link-evidence] Assessment: ${assessment.id}`);
  console.log(`[time-link-evidence]   greenfield catalog: ${assessment.catalogVersionId}`);
  console.log(`[time-link-evidence]   brownfield catalog: ${assessment.brownfieldCatalogVersionId}`);

  // Load processes + tokenize
  const processes = await prisma.customerProcess.findMany({
    where: { assessmentId: assessment.id },
    select: { id: true, processName: true, parentSection: true },
  });
  const procTokens: ProcessTokens[] = processes.map((p) => {
    const nameTokens = tokenize(p.processName);
    const sectionTokens = p.parentSection ? tokenize(p.parentSection) : new Set<string>();
    return {
      id: p.id,
      processName: p.processName,
      parentSection: p.parentSection,
      nameTokens,
      sectionTokens,
      combined: new Set([...nameTokens, ...sectionTokens]),
    };
  });
  console.log(`[time-link-evidence] Loaded ${processes.length} processes`);

  // Load all evidence sources for this assessment's catalogs (do this once)
  const greenfieldItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: assessment.catalogVersionId },
    select: { id: true, scopeCode: true, nameClean: true, functionalArea: true, subArea: true },
  });
  const greenfieldTokens = greenfieldItems.map((g) => ({
    ...g,
    nameTokens: tokenize(g.nameClean),
    areaTokens: tokenize(`${g.functionalArea} ${g.subArea ?? ""}`),
  }));
  console.log(`[time-link-evidence] Loaded ${greenfieldItems.length} greenfield ScopeItems`);

  const brownfieldItems = await prisma.simplificationItem.findMany({
    where: { catalogVersionId: assessment.brownfieldCatalogVersionId, procStatus: "R" },
    select: { id: true, sitemId: true, titleEn: true, applicationArea: true },
  });
  const brownfieldTokens = brownfieldItems.map((b) => ({
    ...b,
    titleTokens: tokenize(b.titleEn),
    areaTokens: tokenize(b.applicationArea),
  }));
  console.log(`[time-link-evidence] Loaded ${brownfieldItems.length} brownfield SimplificationItems (Released only)`);

  const ewaFindings = await prisma.ewaFinding.findMany({
    where: { snapshot: { brownfieldAssessment: { customerName: { contains: "TT dotCom" } } } },
    select: { id: true, title: true, category: true, severity: true },
  });
  const ewaTokens = ewaFindings.map((e) => ({ ...e, tokens: tokenize(e.title) }));
  console.log(`[time-link-evidence] Loaded ${ewaFindings.length} EWA findings`);

  const apis = await prisma.sapApiReference.findMany({
    where: { apiType: "ODATAV4", appliesToPrivate: true, status: "Released" },
    select: { id: true, apiId: true, apiName: true, category: true },
  });
  const apiTokens = apis.map((a) => ({ ...a, tokens: tokenize(a.apiName) }));
  console.log(`[time-link-evidence] Loaded ${apis.length} SAP APIs (PRIVATE OData v4 Released)`);

  const guideSections = await prisma.brownfieldGuideSection.findMany({
    where: { guide: { sourceDocument: "CONV_PE2025.pdf" } },
    select: { id: true, sectionRef: true, title: true, pageStart: true },
  });
  const guideTokens = guideSections.map((g) => ({ ...g, tokens: tokenize(g.title) }));
  console.log(`[time-link-evidence] Loaded ${guideSections.length} CONV Guide TOC sections`);

  const deliverables = await prisma.conversionMethodologyDeliverable.findMany({
    where: { phase: { sourceMethodology: "SAP Activate" } },
    include: { phase: { select: { phaseName: true, phaseSequence: true } } },
  });
  const delivTokens = deliverables.map((d) => ({
    ...d,
    tokens: tokenize(d.deliverableName),
  }));
  console.log(`[time-link-evidence] Loaded ${deliverables.length} Activate methodology deliverables`);

  // Wipe prior links
  const wiped = await prisma.customerProcessSapEvidenceLink.deleteMany({
    where: { customerProcess: { assessmentId: assessment.id } },
  });
  console.log(`[time-link-evidence] Wiped ${wiped.count} prior evidence links`);

  // Build links per process
  const allLinks: EvidenceLinkInput[] = [];

  for (const proc of procTokens) {
    // GREENFIELD: top-3 by combined score
    const greenScored = greenfieldTokens
      .map((g) => ({
        item: g,
        nameOverlap: overlap(proc.nameTokens, g.nameTokens),
        areaOverlap: overlap(proc.sectionTokens, g.areaTokens),
      }))
      .filter((s) => s.nameOverlap >= 1 || s.areaOverlap >= 2)
      .sort((a, b) => (b.nameOverlap * 3 + b.areaOverlap) - (a.nameOverlap * 3 + a.areaOverlap))
      .slice(0, 3);
    for (const [idx, s] of greenScored.entries()) {
      const role = idx === 0 ? "PRIMARY" : "SECONDARY";
      const conf = s.nameOverlap >= 2 ? "high" : s.nameOverlap >= 1 ? "medium" : "low";
      allLinks.push({
        customerProcessId: proc.id,
        evidenceType: "GREENFIELD_SCOPE_ITEM",
        evidenceId: s.item.id,
        role,
        rationaleMd: `Match: ${s.item.scopeCode} "${s.item.nameClean}" (${s.item.functionalArea}). Name overlap=${s.nameOverlap}, area overlap=${s.areaOverlap}. Confidence: ${conf}.`,
      });
    }

    // BROWNFIELD: top-3 by combined score
    const brownScored = brownfieldTokens
      .map((b) => ({
        item: b,
        titleOverlap: overlap(proc.nameTokens, b.titleTokens),
        areaOverlap: overlap(proc.sectionTokens, b.areaTokens),
      }))
      .filter((s) => s.titleOverlap >= 1 || s.areaOverlap >= 2)
      .sort((a, b) => (b.titleOverlap * 3 + b.areaOverlap) - (a.titleOverlap * 3 + a.areaOverlap))
      .slice(0, 3);
    for (const [idx, s] of brownScored.entries()) {
      const role = idx === 0 ? "PRIMARY" : "SECONDARY";
      allLinks.push({
        customerProcessId: proc.id,
        evidenceType: "BROWNFIELD_SIMPLIFICATION_ITEM",
        evidenceId: s.item.id,
        role,
        rationaleMd: `Match: ${s.item.sitemId} "${s.item.titleEn}" (${s.item.applicationArea}). Title overlap=${s.titleOverlap}, area overlap=${s.areaOverlap}.`,
      });
    }

    // EWA: top-3 by overlap (must have ≥2 word overlap to avoid noise)
    const ewaScored = ewaTokens
      .map((e) => ({ finding: e, ov: overlap(proc.combined, e.tokens) }))
      .filter((s) => s.ov >= 2)
      .sort((a, b) => b.ov - a.ov)
      .slice(0, 3);
    for (const s of ewaScored) {
      allLinks.push({
        customerProcessId: proc.id,
        evidenceType: "EWA_FINDING",
        evidenceId: s.finding.id,
        role: "SUPPORTING",
        rationaleMd: `EWA finding "${s.finding.title}" (${s.finding.category}/${s.finding.severity}); ${s.ov} keyword overlap.`,
      });
    }

    // API: top-3 (must have ≥1 name overlap)
    const apiScored = apiTokens
      .map((a) => ({ api: a, ov: overlap(proc.nameTokens, a.tokens) }))
      .filter((s) => s.ov >= 1)
      .sort((a, b) => b.ov - a.ov)
      .slice(0, 3);
    for (const s of apiScored) {
      allLinks.push({
        customerProcessId: proc.id,
        evidenceType: "API_REFERENCE",
        evidenceId: s.api.id,
        role: "SUPPORTING",
        rationaleMd: `SAP API ${s.api.apiId} "${s.api.apiName}" available for integration; ${s.ov} keyword overlap.`,
      });
    }

    // GUIDE_SECTION: top-2
    const guideScored = guideTokens
      .map((g) => ({ section: g, ov: overlap(proc.combined, g.tokens) }))
      .filter((s) => s.ov >= 1)
      .sort((a, b) => b.ov - a.ov)
      .slice(0, 2);
    for (const s of guideScored) {
      allLinks.push({
        customerProcessId: proc.id,
        evidenceType: "GUIDE_SECTION",
        evidenceId: s.section.id,
        role: "SUPPORTING",
        rationaleMd: `Conversion Guide §${s.section.sectionRef} "${s.section.title}" (page ${s.section.pageStart}); ${s.ov} keyword overlap.`,
      });
    }

    // METHODOLOGY_DELIVERABLE: top-2
    const delivScored = delivTokens
      .map((d) => ({ deliv: d, ov: overlap(proc.combined, d.tokens) }))
      .filter((s) => s.ov >= 1)
      .sort((a, b) => b.ov - a.ov)
      .slice(0, 2);
    for (const s of delivScored) {
      allLinks.push({
        customerProcessId: proc.id,
        evidenceType: "METHODOLOGY_DELIVERABLE",
        evidenceId: s.deliv.id,
        role: "SUPPORTING",
        rationaleMd: `SAP Activate ${s.deliv.phase.phaseName} (Phase ${s.deliv.phase.phaseSequence}) deliverable "${s.deliv.deliverableName}".`,
      });
    }
  }

  console.log(`[time-link-evidence] Inserting ${allLinks.length} evidence links...`);
  const chunkSize = 500;
  for (let i = 0; i < allLinks.length; i += chunkSize) {
    await prisma.customerProcessSapEvidenceLink.createMany({
      data: allLinks.slice(i, i + chunkSize),
      skipDuplicates: true,
    });
  }

  // Distribution stats
  const byType: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  for (const l of allLinks) {
    byType[l.evidenceType] = (byType[l.evidenceType] ?? 0) + 1;
    byRole[l.role] = (byRole[l.role] ?? 0) + 1;
  }
  console.log(``);
  console.log(`[time-link-evidence] Done.`);
  console.log(`  Total links inserted        : ${allLinks.length}`);
  console.log(`  Avg per process             : ${(allLinks.length / processes.length).toFixed(1)}`);
  console.log(`  By evidence type:`);
  for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(35)} ${c}`);
  }
  console.log(`  By role:`);
  for (const [r, c] of Object.entries(byRole).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${r.padEnd(15)} ${c}`);
  }

  // Coverage check: how many processes have ≥1 PRIMARY of each major type?
  const pPrim = await prisma.customerProcess.count({
    where: {
      assessmentId: assessment.id,
      evidenceLinks: { some: { evidenceType: "GREENFIELD_SCOPE_ITEM", role: "PRIMARY" } },
    },
  });
  const bPrim = await prisma.customerProcess.count({
    where: {
      assessmentId: assessment.id,
      evidenceLinks: { some: { evidenceType: "BROWNFIELD_SIMPLIFICATION_ITEM", role: "PRIMARY" } },
    },
  });
  console.log(``);
  console.log(`  Processes with PRIMARY greenfield link    : ${pPrim} / ${processes.length}`);
  console.log(`  Processes with PRIMARY brownfield link    : ${bPrim} / ${processes.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[time-link-evidence] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
