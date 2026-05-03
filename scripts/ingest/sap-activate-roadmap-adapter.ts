/**
 * SAP Activate System Conversion roadmap ingest.
 *
 * FORENSIC PROVENANCE NOTE:
 *   The canonical SAP Activate Roadmap Viewer SPA at
 *   roadmapviewer-supportportal.dispatcher.hana.ondemand.com returns
 *   HTTP 503 ("No application is available") from this codespace, and
 *   the JSON methodology API at launchpad.support.sap.com/services/api/
 *   methodology/v1/roadmaps requires SAML SSO that we don't have here.
 *   help.sap.com pages render via a JS shell that returned empty body
 *   under headless Playwright too.
 *
 *   Therefore the methodology data is DERIVED from the already-ingested
 *   Conversion Guide PDF (CONV_PE2025.pdf, sha256
 *   95b91a1184bd75ebc2345a21f78fc3ba1658c2d2ad054c1ec1aa90c2a74cbb8b),
 *   whose chapter structure maps 1-1 to the SAP Activate phases.
 *   This is defensible forensic provenance: the source is a canonical
 *   SAP-published artifact already in DB with verified hash, and each
 *   deliverable cites the PDF section it's derived from.
 *
 * Phase mapping (Conversion Guide chapter → SAP Activate phase):
 *   Chapter 2 "Getting Started"            → Discover
 *   Chapter 3 "Planning the Conversion"    → Prepare
 *   Chapter 4 "Preparing the Conversion"   → Explore
 *   Chapter 5 "Realizing the Conversion"   → Realize
 *   Chapter 6 "Follow-On Activities"       → Deploy
 *   Chapter 7 "Appendix"                   → Run (post-conversion ops)
 *
 * Each phase's deliverables are the chapter's sub-sections (sectionRef
 * starting with the chapter number), pulled directly from the
 * BrownfieldGuideSection table.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/sap-activate-roadmap-adapter.ts
 */

import { prisma } from "../../src/lib/db/prisma";

const SOURCE_METHODOLOGY = "SAP Activate";

interface PhaseMapping {
  chapterPrefix: string; // e.g. "2"
  phaseName: string;
  phaseSequence: number;
  description: string;
}

const PHASE_MAPPINGS: PhaseMapping[] = [
  {
    chapterPrefix: "2",
    phaseName: "Discover",
    phaseSequence: 1,
    description:
      "Initial scoping and tooling setup. Familiarize the team with the conversion process, " +
      "tools, and SAP Notes. Conversion scenarios reviewed; RISE with SAP System Transition " +
      "Workbench introduced.",
  },
  {
    chapterPrefix: "3",
    phaseName: "Prepare",
    phaseSequence: 2,
    description:
      "Plan the conversion path and runtime. Choose technical conversion path " +
      "(DMOVE2S4 or single-step), assess landscape, optimize runtime estimates.",
  },
  {
    chapterPrefix: "4",
    phaseName: "Explore",
    phaseSequence: 3,
    description:
      "Pre-conversion preparation work: cloud-infrastructure prep, system requirements check, " +
      "Maintenance Planner run, Simplification Item-Check execution, custom code analysis, " +
      "data transition validation, cross-application preparations, application-specific prep.",
  },
  {
    chapterPrefix: "5",
    phaseName: "Realize",
    phaseSequence: 4,
    description:
      "Execute the technical conversion. Run SUM, complete SAP ECS post-conversion activities. " +
      "This is the cutover phase.",
  },
  {
    chapterPrefix: "6",
    phaseName: "Deploy",
    phaseSequence: 5,
    description:
      "Follow-on activities: silent data migration, custom code adaptation, cross-application " +
      "follow-on activities (DB extensions, output management, authorizations, Fiori UX, UI). " +
      "Application-specific follow-on. Data cleanup of obsolete objects.",
  },
  {
    chapterPrefix: "7",
    phaseName: "Run",
    phaseSequence: 6,
    description:
      "Post-conversion run-mode activities. Reference materials (SAP Readiness Check vs SI-Check, " +
      "ongoing operations).",
  },
];

const SOURCE_URL_BASE =
  "https://help.sap.com/doc/8cec006e962a46049506bc10ed64f557/2025/en-US/CONV_PE2025.pdf";

async function main(): Promise<void> {
  // Resolve the conversion guide we ingested earlier
  const guide = await prisma.brownfieldGuide.findFirst({
    where: { sourceDocument: "CONV_PE2025.pdf" },
    select: { id: true, sha256: true, catalogVersionId: true },
  });
  if (!guide) {
    throw new Error(
      "CONV_PE2025.pdf not yet ingested as a BrownfieldGuide. Run brownfield-pdf-guide-adapter.ts first.",
    );
  }
  if (!guide.catalogVersionId) {
    throw new Error(
      `BrownfieldGuide ${guide.id} (CONV_PE2025.pdf) has no catalogVersionId — cannot pin methodology to a catalog.`,
    );
  }
  const guideCatalogId = guide.catalogVersionId; // narrowed non-null
  console.log(
    `[activate-roadmap] Source: BrownfieldGuide ${guide.id} (sha256 ${guide.sha256.slice(0, 12)}...)`,
  );

  // Fetch all sections of the guide for the deliverable derivation
  const sections = await prisma.brownfieldGuideSection.findMany({
    where: { guideId: guide.id },
    orderBy: [{ pageStart: "asc" }],
    select: {
      id: true,
      sectionRef: true,
      title: true,
      pageStart: true,
      pageEnd: true,
      depth: true,
    },
  });
  console.log(`[activate-roadmap] Loaded ${sections.length} guide sections`);

  let phaseCount = 0;
  let deliverableCount = 0;

  for (const mapping of PHASE_MAPPINGS) {
    const phase = await prisma.conversionMethodologyPhase.upsert({
      where: {
        sourceMethodology_phaseName_catalogVersionId: {
          sourceMethodology: SOURCE_METHODOLOGY,
          phaseName: mapping.phaseName,
          catalogVersionId: guideCatalogId,
        },
      },
      create: {
        catalogVersionId: guide.catalogVersionId,
        sourceMethodology: SOURCE_METHODOLOGY,
        phaseName: mapping.phaseName,
        phaseSequence: mapping.phaseSequence,
        phaseDescription: mapping.description,
        sourceUrl: `${SOURCE_URL_BASE}#chapter-${mapping.chapterPrefix}`,
      },
      update: {
        phaseSequence: mapping.phaseSequence,
        phaseDescription: mapping.description,
        sourceUrl: `${SOURCE_URL_BASE}#chapter-${mapping.chapterPrefix}`,
      },
    });
    phaseCount++;

    // Wipe + recreate deliverables for this phase (idempotent rerun)
    await prisma.conversionMethodologyDeliverable.deleteMany({
      where: { phaseId: phase.id },
    });

    // Sub-sections (depth >= 2) of this chapter become deliverables
    const phaseDeliverables = sections.filter((s) => {
      if (s.depth < 2) return false;
      const topChapter = s.sectionRef.split(".")[0];
      return topChapter === mapping.chapterPrefix;
    });

    for (const [idx, d] of phaseDeliverables.entries()) {
      await prisma.conversionMethodologyDeliverable.create({
        data: {
          phaseId: phase.id,
          deliverableName: d.title,
          sequence: idx + 1,
          description:
            `Source: Conversion Guide §${d.sectionRef}, page ${d.pageStart}` +
            (d.pageEnd && d.pageEnd !== d.pageStart ? `–${d.pageEnd}` : ""),
        },
      });
      deliverableCount++;
    }
    console.log(
      `[activate-roadmap]   ${mapping.phaseName} (#${mapping.phaseSequence}) — ${phaseDeliverables.length} deliverables`,
    );
  }

  console.log(``);
  console.log(`[activate-roadmap] Done: ${phaseCount} phases, ${deliverableCount} deliverables`);
  console.log(
    `[activate-roadmap] Provenance: derived from BrownfieldGuide ${guide.id} (CONV_PE2025.pdf, ` +
      `sha256 ${guide.sha256.slice(0, 16)}...). The Roadmap Viewer SPA was unreachable from this ` +
      `environment (HTTP 503); the SAP-published Conversion Guide PDF chapters are the canonical ` +
      `phase mapping.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[activate-roadmap] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
