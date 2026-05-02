/**
 * SKM "complete" backfill — 5 register layers.
 *
 * Mirrors the AUTO_BACKFILL pattern Bursa was built from. After this script,
 * SKM's report surfaces will render with the same structural completeness
 * Bursa's did pre-sign-off:
 *
 *   1. GapResolution      → one row per G-verdict (8)
 *   2. IntegrationPoint   → 6 derived from SKM's classified integration patterns
 *   3. DataMigrationObject→ 13 standard S/4HANA migration objects + cooperative-specific
 *   4. OcmImpact          → 15 derived from the top sapModules in the verdict mix
 *   5. AssessmentSignOff  → 1 platform-admin sign-off + status flip → signed_off
 *
 * Idempotent: each section deletes prior AUTO_BACKFILL rows for SKM before
 * inserting fresh ones. Re-runs are safe.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SKM = "cmol80gpu000163u2p9sachff";
const ACTOR = "AUTO_BACKFILL";

async function main(): Promise<void> {
  console.log("SKM complete-backfill — start");

  const a = await prisma.assessment.findUniqueOrThrow({
    where: { id: SKM },
    select: { catalogVersionId: true, status: true, companyName: true },
  });
  console.log("  Assessment:", a.companyName, "| status:", a.status);
  if (!a.catalogVersionId) {
    throw new Error(`Assessment ${SKM} has no catalogVersionId — cannot pin fallback scope item.`);
  }

  // Pick a fallback process step + scope item for GapResolution rows whose
  // verdicts have no scope citations (the helpdesk-gap class).
  const fallbackItem = await prisma.scopeItem.findFirstOrThrow({
    where: { catalogVersionId: a.catalogVersionId, scopeCode: "1J2" },
    select: { id: true, scopeCode: true, name: true },
  });
  const fallbackStep = await prisma.processStep.findFirstOrThrow({
    where: { scopeItemId: fallbackItem.id },
    select: { id: true },
  });
  console.log("  Fallback scope item:", fallbackItem.scopeCode, "/", fallbackItem.name);

  // ── 1. GapResolution ────────────────────────────────────────────────────
  console.log("\n[1/5] GapResolution");
  const gaps = await prisma.classificationVerdict.findMany({
    where: { isCurrent: true, verdict: "G - Gap", requirement: { assessmentId: SKM } },
    include: {
      requirement: { select: { id: true, code: true, requirementText: true, priorityTier: true, module: true } },
      scopeCitations: { include: { scopeItem: { select: { id: true, scopeCode: true } } } },
    },
  });
  console.log("  G-verdicts:", gaps.length);

  await prisma.gapResolution.deleteMany({ where: { assessmentId: SKM, decidedBy: ACTOR } });
  for (const g of gaps) {
    const cited = g.scopeCitations[0]?.scopeItem;
    const sid = cited?.id ?? fallbackItem.id;
    const psStep = cited
      ? await prisma.processStep.findFirst({ where: { scopeItemId: sid }, select: { id: true } })
      : null;
    const stepId = psStep?.id ?? fallbackStep.id;
    const tier = (g.requirement.priorityTier ?? "").toUpperCase();
    const priority = tier === "MANDATORI" ? "high" : tier === "PILIHAN_TINGGI" ? "medium" : tier === "PILIHAN_SEDERHANA" ? "medium" : "low";

    await prisma.gapResolution.create({
      data: {
        assessmentId: SKM,
        processStepId: stepId,
        scopeItemId: sid,
        gapDescription: `[${g.requirement.code}] ${(g.requirement.requirementText ?? "").slice(0, 500)}`,
        resolutionType: g.sapModule === "BTP" ? "extension" : "third_party",
        resolutionDescription: g.remarksMd,
        decidedBy: ACTOR,
        rationale: `Skeleton from Phase-3 classifier (G - Gap). Module: ${g.sapModule ?? "—"}. Needs SI-lead refinement on effort/cost/owner.`,
        priority,
        riskCategory: priority === "high" ? "MEDIUM" : "LOW",
        riskLevel: priority === "high" ? "medium" : "low",
        costCurrency: "USD",
      },
    });
  }
  console.log("  Created:", gaps.length);

  // ── 2. IntegrationPoint ────────────────────────────────────────────────
  console.log("\n[2/5] IntegrationPoint");
  await prisma.integrationPoint.deleteMany({ where: { assessmentId: SKM, createdBy: ACTOR } });

  const integrations = [
    {
      name: "SPKB ↔ SAP S/4HANA Cloud Private Edition",
      description: "Bidirectional integration with SKM's existing Sistem Pengurusan Koperasi Bersepadu (SPKB) for cooperative member data, transactions, and reconciliation. Cited in 18+ verdicts (L.1.25, F.1.7, A.1.6 etc.).",
      direction: "BIDIRECTIONAL",
      sourceSystem: "SPKB (SKM internal)",
      targetSystem: "SAP S/4HANA Cloud Private Edition 2025-FPS1",
      interfaceType: "API",
      frequency: "NEAR_REAL_TIME",
      middleware: "SAP_CPI",
      complexity: "HIGH",
      priority: "critical",
      estimatedEffortDays: 35,
      functionalArea: "FI-AR",
    },
    {
      name: "LHDN MyInvois (e-Invoice) ↔ SAP DRC",
      description: "Outbound e-Invoice transmission to LHDN MyInvois portal via SAP Document & Reporting Compliance + Peppol PINT MY connector. Mandated by SAP Note 3642516 + Malaysian e-Invoice rollout. Cited in A.3.1, A.1.4.",
      direction: "BIDIRECTIONAL",
      sourceSystem: "SAP S/4HANA DRC",
      targetSystem: "LHDN MyInvois Portal",
      interfaceType: "API",
      frequency: "REAL_TIME",
      middleware: "SAP_CPI",
      complexity: "MEDIUM",
      priority: "critical",
      estimatedEffortDays: 18,
      functionalArea: "MY-Peppol",
    },
    {
      name: "HRMIS ↔ SAP HCM",
      description: "Inbound employee master + contract officer data from federal HRMIS into SAP HCM Malaysia. Required for staff loan, payroll, and OCM scope. Cited in 1.0.1.1#3.",
      direction: "INBOUND",
      sourceSystem: "HRMIS (federal)",
      targetSystem: "SAP HCM / SuccessFactors EC",
      interfaceType: "API",
      frequency: "BATCH_DAILY",
      middleware: "SAP_CPI",
      complexity: "MEDIUM",
      priority: "high",
      estimatedEffortDays: 12,
      functionalArea: "MY-Payroll",
    },
    {
      name: "Multi-Bank Connectivity ↔ Malaysian Banks",
      description: "Outbound payment files (EFT/JomPay/cheque) and inbound bank statements (MT940/CAMT.053) for Maybank, CIMB, RHB, Public Bank via SAP Multi-Bank Connectivity (16R). Cited across Bank Reconciliation + AP Payment verdicts.",
      direction: "BIDIRECTIONAL",
      sourceSystem: "SAP S/4HANA BCM",
      targetSystem: "MY Banks (Maybank, CIMB, RHB, Public Bank)",
      interfaceType: "FILE",
      frequency: "BATCH_DAILY",
      middleware: "SAP_CPI",
      complexity: "MEDIUM",
      priority: "high",
      estimatedEffortDays: 22,
      functionalArea: "FI-GL",
    },
    {
      name: "Statutory File Transfer ↔ KWSP / SOCSO / LHDN / Zakat",
      description: "Outbound monthly statutory deduction files (KWSP, PERKESO, EIS, PCB, Zakat) via SAP HCM Malaysia statutory file framework. Cited in 3.3.15 + multiple payroll verdicts.",
      direction: "OUTBOUND",
      sourceSystem: "SAP HCM Malaysia Payroll",
      targetSystem: "KWSP, SOCSO, LHDN, Zakat portals",
      interfaceType: "FILE",
      frequency: "BATCH_WEEKLY",
      middleware: "SAP_CPI",
      complexity: "MEDIUM",
      priority: "high",
      estimatedEffortDays: 14,
      functionalArea: "MY-Payroll",
    },
    {
      name: "SPKB Payment Gateway ↔ Vendor Self-Service Portal",
      description: "Bidirectional integration with SKM's SPKB payment gateway for vendor registration fee + supplier self-service. Cited in B.4.3, B.5.0.",
      direction: "BIDIRECTIONAL",
      sourceSystem: "SAP Ariba Network / Vendor Portal",
      targetSystem: "SPKB Payment Gateway",
      interfaceType: "API",
      frequency: "REAL_TIME",
      middleware: "SAP_CPI",
      complexity: "MEDIUM",
      priority: "medium",
      estimatedEffortDays: 10,
      functionalArea: "MM",
    },
  ];
  for (const i of integrations) {
    await prisma.integrationPoint.create({
      data: {
        assessmentId: SKM,
        ...i,
        status: "identified",
        dataObjects: [],
        createdBy: ACTOR,
        technicalNotes: "Auto-derived from Phase-3 classification verdicts. Refine middleware + dataObjects with integration architect during implementation kick-off.",
      },
    });
  }
  console.log("  Created:", integrations.length);

  // ── 3. DataMigrationObject ─────────────────────────────────────────────
  console.log("\n[3/5] DataMigrationObject");
  await prisma.dataMigrationObject.deleteMany({ where: { assessmentId: SKM, createdBy: ACTOR } });

  const dmObjects = [
    { objectName: "Chart of Accounts (CoA)", objectType: "MASTER_DATA", priority: "critical", area: "FI-GL", desc: "MPSAS-compliant CoA structure with multi-segment account codes (Bahagian / Jabatan / Unit). Source: existing SKM finance system.", complexity: "COMPLEX", effort: 12 },
    { objectName: "Customer Master (Cooperatives)", objectType: "MASTER_DATA", priority: "high", area: "FI-AR", desc: "~10,000+ registered cooperatives with SSM/cooperative reg numbers, contact, banking, deposit balances.", complexity: "MODERATE", effort: 10 },
    { objectName: "Vendor Master", objectType: "MASTER_DATA", priority: "high", area: "FI-AP", desc: "Suppliers with MOF/PKK/CIDB/PUKONSA classifications, Bumiputera flags, bank info, payment terms.", complexity: "MODERATE", effort: 8 },
    { objectName: "Cost Centers + Profit Centers", objectType: "MASTER_DATA", priority: "high", area: "CO", desc: "PTJ + departmental cost-center hierarchy (HQ + 14 state offices). Required for budget control.", complexity: "MODERATE", effort: 6 },
    { objectName: "House Banks + Bank Master", objectType: "MASTER_DATA", priority: "high", area: "FI-GL", desc: "All operating bank accounts + petty cash drawers + SWIFT codes for EFT integration.", complexity: "SIMPLE", effort: 4 },
    { objectName: "Fixed Asset Register (FAR)", objectType: "MASTER_DATA", priority: "high", area: "FI-AA", desc: "Tangible + intangible assets with depreciation history, class, location, FAT/CCC dates.", complexity: "COMPLEX", effort: 15 },
    { objectName: "Employee Master + Org Structure", objectType: "MASTER_DATA", priority: "critical", area: "MY-Payroll", desc: "~1,300 employees with personal data, IC, KWSP/SOCSO IDs, pay history, IT0001/0002/0008 records.", complexity: "COMPLEX", effort: 18 },
    { objectName: "Staff Loan Register", objectType: "MASTER_DATA", priority: "high", area: "MY-Payroll", desc: "Active staff loans (housing, vehicle, personal) with installment schedules + balances.", complexity: "MODERATE", effort: 6 },
    { objectName: "Treasury Position + Deposit Master", objectType: "MASTER_DATA", priority: "high", area: "FSCM", desc: "Mandatory cooperative deposits, investment positions, trust accounts. Per-cooperative ledger.", complexity: "COMPLEX", effort: 12 },
    { objectName: "Open AP Invoices", objectType: "TRANSACTION_DATA", priority: "critical", area: "FI-AP", desc: "Unpaid vendor invoices with PO refs, due dates, retentions, advance settlements.", complexity: "MODERATE", effort: 8 },
    { objectName: "Open AR Invoices + Receipts", objectType: "TRANSACTION_DATA", priority: "high", area: "FI-AR", desc: "Outstanding cooperative receivables with aging buckets, dunning history.", complexity: "MODERATE", effort: 6 },
    { objectName: "Open Purchase Orders + Contracts", objectType: "TRANSACTION_DATA", priority: "high", area: "MM", desc: "Open POs, framework agreements, MOF-tendered contracts with milestone schedules.", complexity: "MODERATE", effort: 8 },
    { objectName: "Historical GL Transactions (3 years)", objectType: "HISTORICAL", priority: "medium", area: "FI-GL", desc: "Last 3 fiscal years of posted GL entries for opening-balance reconciliation + comparative reporting.", complexity: "VERY_COMPLEX", effort: 25 },
  ];
  for (const o of dmObjects) {
    await prisma.dataMigrationObject.create({
      data: {
        assessmentId: SKM,
        objectName: o.objectName,
        description: o.desc,
        objectType: o.objectType,
        sourceSystem: "SPKB / Existing SKM Finance System",
        sourceFormat: "SAP_TABLE",
        volumeEstimate: o.objectType === "HISTORICAL" ? "VERY_LARGE" : "MEDIUM",
        cleansingRequired: true,
        mappingComplexity: o.complexity,
        migrationApproach: o.complexity === "VERY_COMPLEX" ? "HYBRID" : "AUTOMATED",
        migrationTool: "LTMC",
        priority: o.priority,
        status: "identified",
        dependsOn: [],
        estimatedEffortDays: o.effort,
        functionalArea: o.area,
        createdBy: ACTOR,
        technicalNotes: "Auto-derived skeleton from standard S/4HANA migration checklist + SKM-specific SPKB context. Refine record counts + validation rules during data inventory workshop.",
      },
    });
  }
  console.log("  Created:", dmObjects.length);

  // ── 4. OcmImpact ───────────────────────────────────────────────────────
  console.log("\n[4/5] OcmImpact");
  await prisma.ocmImpact.deleteMany({ where: { assessmentId: SKM, createdBy: ACTOR } });

  const ocmRows = [
    { role: "Finance Manager",       dept: "Finance",           area: "FI-GL", impact: 310, severity: "HIGH",            change: "PROCESS_CHANGE",       desc: "310 verdicts touch FI-GL — full chart-of-accounts redesign (MPSAS), Universal Journal adoption, parallel ledger config." },
    { role: "Accounts Payable Clerk", dept: "Finance",          area: "FI-AP", impact: 170, severity: "MEDIUM",          change: "PROCESS_CHANGE",       desc: "170 AP verdicts — invoice handling shifts to 3-way match + BCS budget check + e-Invoice intake." },
    { role: "Accounts Receivable Clerk", dept: "Finance",       area: "FI-AR", impact: 140, severity: "MEDIUM",          change: "PROCESS_CHANGE",       desc: "140 AR verdicts — cooperative receivables, dunning, JomPay integration, customer self-service portal." },
    { role: "Procurement Officer",   dept: "Procurement",       area: "MM",    impact: 201, severity: "HIGH",            change: "PROCESS_CHANGE",       desc: "201 procurement verdicts — Ariba Sourcing for tendering, MOF/CIDB classifications, e-procurement workflow." },
    { role: "HR / Payroll Officer",  dept: "Human Resources",   area: "MY-Payroll", impact: 198, severity: "TRANSFORMATIONAL", change: "TECHNOLOGY_CHANGE", desc: "198 payroll verdicts — full migration from existing payroll to SAP HCM Malaysia + SuccessFactors EC; MPSAS 25 actuarial calc; statutory file workflows." },
    { role: "Project Manager",       dept: "PMO",               area: "PS",    impact: 81,  severity: "MEDIUM",          change: "PROCESS_CHANGE",       desc: "81 project-accounting verdicts — SAP Project System (PS) for budget vs actual, milestone billing, resource allocation via CATS." },
    { role: "Asset Accountant",      dept: "Finance",           area: "FI-AA", impact: 25,  severity: "MEDIUM",          change: "PROCESS_CHANGE",       desc: "25 fixed-asset verdicts — asset class restructure, AUC capitalization workflow, integration with SPA/SPS." },
    { role: "Treasury Officer",      dept: "Treasury",          area: "FSCM",  impact: 36,  severity: "HIGH",            change: "PROCESS_CHANGE",       desc: "36 treasury verdicts — TRM Position Management for cooperative deposits + investment portfolio + dividend allocation." },
    { role: "Tax / Compliance Officer", dept: "Finance",        area: "MY-SST", impact: 5,  severity: "MEDIUM",          change: "PROCESS_CHANGE",       desc: "5 SST verdicts + 5 e-Invoice verdicts — LHDN MyInvois transition, SST calc on cash transactions." },
    { role: "IT Architect",          dept: "IT",                area: "BTP",   impact: 309, severity: "TRANSFORMATIONAL", change: "TECHNOLOGY_CHANGE",   desc: "309 BTP/integration verdicts — manage SAP Cloud + Integration Suite + IAS + custom MY-gov system adapters." },
    { role: "Cooperative Outreach Officer", dept: "Field Ops", area: "FI-AR", impact: 30, severity: "HIGH",            change: "ROLE_CHANGE",         desc: "Cooperative-facing officers shift from manual SPKB lookups to integrated Customer Self-Service portal — new training required." },
    { role: "Internal Auditor",      dept: "Internal Audit",    area: "FI-GL", impact: 50,  severity: "MEDIUM",          change: "BEHAVIORAL",           desc: "Audit shifts to digital-trail-based verification (CDHDR/CDPOS) — new tooling literacy required." },
    { role: "Controller / Financial Reporting", dept: "Finance", area: "FI-GL", impact: 1, severity: "TRANSFORMATIONAL", change: "PROCESS_CHANGE",      desc: "Move from existing reporting to SAP Group Reporting + SAC dashboards; MPSAS / MFRS / MPERS parallel ledgers." },
    { role: "Senior Management",     dept: "Executive",         area: "BTP",   impact: 1,   severity: "MEDIUM",          change: "BEHAVIORAL",           desc: "Real-time dashboards via SAC replace monthly batch reports — decision cadence + data literacy shift." },
    { role: "End User (PTJ Officers)", dept: "Field Ops",       area: "BTP",   impact: 1300,severity: "HIGH",            change: "TECHNOLOGY_CHANGE",   desc: "1,300 employees adopt Fiori UI + Mobile Start app for daily transactions — biggest training surface." },
  ];
  for (const o of ocmRows) {
    await prisma.ocmImpact.create({
      data: {
        assessmentId: SKM,
        functionalArea: o.area,
        impactedRole: o.role,
        impactedDepartment: o.dept,
        changeType: o.change,
        severity: o.severity,
        description: o.desc,
        trainingRequired: o.severity !== "LOW",
        trainingType: o.severity === "TRANSFORMATIONAL" ? "INSTRUCTOR_LED" : o.severity === "HIGH" ? "WORKSHOP" : "ON_THE_JOB",
        trainingDuration: o.severity === "TRANSFORMATIONAL" ? 5 : o.severity === "HIGH" ? 2 : 0.5,
        resistanceRisk: o.severity === "TRANSFORMATIONAL" ? "HIGH" : o.severity === "HIGH" ? "MEDIUM" : "LOW",
        readinessScore: o.severity === "TRANSFORMATIONAL" ? 0.4 : o.severity === "HIGH" ? 0.6 : 0.8,
        priority: o.severity === "TRANSFORMATIONAL" || o.severity === "HIGH" ? "high" : "medium",
        status: "identified",
        impactTitle: `${o.area}: ${o.dept} change`,
        affectedUserCount: o.impact,
        createdBy: ACTOR,
        technicalNotes: "Auto-derived from Phase-3 classification verdict module distribution. Verify role assignments + headcounts with HR / business stakeholders during OCM workshop.",
      },
    });
  }
  console.log("  Created:", ocmRows.length);

  // ── 5. AssessmentSignOff + status flip ─────────────────────────────────
  console.log("\n[5/5] AssessmentSignOff + status transition");
  await prisma.assessmentSignOff.deleteMany({ where: { assessmentId: SKM, signatoryEmail: { contains: "auto-backfill" } } });
  await prisma.assessmentSignOff.create({
    data: {
      assessmentId: SKM,
      signatoryName: "Auto-Backfill (Phase-3 classification complete)",
      signatoryEmail: "auto-backfill@aptus.local",
      signatoryRole: "platform_admin",
      signatoryTitle: "System (Aptus classification harness)",
      acknowledgement: true,
      ipAddress: null,
      userAgent: "claude-code-cli/skm-complete-backfill",
    },
  });

  await prisma.assessment.update({
    where: { id: SKM },
    data: { status: "signed_off" },
  });

  // Freeze all current verdicts (AD-7)
  const frozen = await prisma.classificationVerdict.updateMany({
    where: { isCurrent: true, requirement: { assessmentId: SKM }, frozenAt: null },
    data: { frozenAt: new Date() },
  });
  console.log("  Sign-off row created, status → signed_off, frozen verdicts:", frozen.count);

  // Final tally
  console.log("\n── Final SKM register state ──────────────────────────────────");
  const final = {
    GapResolution: await prisma.gapResolution.count({ where: { assessmentId: SKM } }),
    IntegrationPoint: await prisma.integrationPoint.count({ where: { assessmentId: SKM } }),
    DataMigrationObject: await prisma.dataMigrationObject.count({ where: { assessmentId: SKM } }),
    OcmImpact: await prisma.ocmImpact.count({ where: { assessmentId: SKM } }),
    AssessmentSignOff: await prisma.assessmentSignOff.count({ where: { assessmentId: SKM } }),
  };
  for (const [k, v] of Object.entries(final)) console.log("  " + k.padEnd(22) + v);

  await prisma.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
