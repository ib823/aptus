/**
 * TIME RFT classifier v2 — module-strict, evidence-grounded, audit-proof.
 *
 * Replaces classify-batches-deterministic.ts + emit-classification-prompts.ts
 * pipeline with a single DB-driven pass that fixes the v1 mismatch problem
 * (Finance reqs citing R&D scope items, HCM reqs citing Warehouse, etc.).
 *
 * Decision flow per requirement:
 *
 *   STEP 0 — SKIP-LIST CHECK
 *     If crossCuttingTag = SECTION_HEADER         → "Information only" verdict
 *     If crossCuttingTag = CROSS_CUTTING_OTHER
 *        AND requirementText is SOW preamble      → "Information only" verdict
 *
 *   STEP 1 — APPLICABILITY
 *     module = TCO                                → N/A (commercial scaffolding)
 *
 *   STEP 2 — CROSS-CUTTING TAG ROUTING
 *     PROJECT_MGMT, METHODOLOGY, RISK_GOVERNANCE,
 *     CHANGE_MGMT, LEGAL_COMPLIANCE, COMMERCIAL_TCO,
 *     DATA_MIGRATION, WORKFLOW_APPROVAL, INTEGRATION_TOUCHPOINT
 *                                                  → tag-specific Remarks
 *                                                    (no scope item cite —
 *                                                    these are delivery /
 *                                                    methodology overlays)
 *     SECURITY_OVERLAY                             → SAP IAM/PFCG cite
 *     IT_ARCHITECTURE                              → BTP/landscape cite
 *     REPORTING                                    → Embedded Analytics +
 *                                                    SAC mention
 *
 *   STEP 3 — PROCESS-ANCHORED GROUNDING
 *     If req has ≥1 CustomerProcessRequirementLink
 *     → Pull GREENFIELD evidence from
 *       CustomerProcessSapEvidenceLink (PRIMARY role) — these are
 *       curated by the process linker and module-correct by construction.
 *     → Cite top-3 by role priority
 *     → Verdict = O if any PRIMARY greenfield, else C
 *
 *   STEP 4 — MODULE-STRICT GREENFIELD MATCH
 *     For non-process-anchored reqs:
 *     1. Look up sapModule (FI / FI-AA / MM / MM-IM / etc.)
 *     2. Filter ScopeItem.functionalArea to whitelist for that module:
 *        FI / FI-AA  → "Finance" + "Asset Management"
 *        MM          → "Sourcing and Procurement"
 *        MM-IM       → "Sourcing and Procurement" + "Supply Chain"
 *     3. Score by token overlap on (cleanedName + subArea)
 *     4. score ≥ 3 → O, score ≥ 1 → C, no module-strict candidate → fall through
 *
 *   STEP 5 — GAP PRODUCT
 *     If reqText hits known gap-product pattern → G + product cite
 *     (SuccessFactors, Ariba, Concur, BPA, SAC, BTP, Signavio)
 *
 *   STEP 6 — BROWNFIELD ADDITIVE CLAUSE
 *     If req mentions retain/migrate/convert/legacy
 *     OR has linked process → cite top brownfield SImpl Item
 *
 *   STEP 7 — CUSTOMER CONTEXT CLAUSE
 *     If linked process present → cite processName + page refs + pain point
 *
 *   STEP 8 — REMARK COMPOSITION + WRITE
 *     Compose deterministically; write via direct DB ops matching
 *     apply-classification-results.ts pattern.
 *
 * Usage:
 *   $ pnpm tsx scripts/time/classify-v2-module-strict.ts
 *   $ pnpm tsx scripts/time/classify-v2-module-strict.ts --dry-run
 */

import { prisma } from "../../src/lib/db/prisma";

const TIME_ASSESSMENT_ID = "cmopnc80z000263fq9zd4cmlw";

// -------------------------------------------------------------
// Module → functional area mapping (strict)
// -------------------------------------------------------------

const MODULE_AREA_WHITELIST: Record<string, string[]> = {
  FI:      ["Finance"],
  "FI-AA": ["Asset Management", "Finance"],
  MM:      ["Sourcing and Procurement"],
  "MM-IM": ["Sourcing and Procurement", "Supply Chain"],
};

// Modules that have NO greenfield scope items in the 271-item Public/Private catalog
// (HCM → SuccessFactors; GRC → security overlay; IT → BTP/architecture; SOW → cross-cutting)
const MODULES_WITHOUT_GREENFIELD = new Set(["HCM", "Security", "IT", "SOW", "TCO"]);

// -------------------------------------------------------------
// Tokenisation + scoring
// -------------------------------------------------------------

const STOP_WORDS = new Set([
  "the","a","an","and","or","of","to","in","on","for","with","by","at","is","are","be","this","that","shall","will","not","as","from","into","via","support","supports","supported","provide","provides","provided","must","may","required","requirement","system","standard","existing","ensure","ensures","include","includes","included","across","also","such","each","any","all","other","both","new","using","use","used","based","per","through","between","within","where","when","while","without","over","under","its","they","them","their","than","then","you","your","our","its","more","most","one","two","three","four","five","six","seven","eight","nine","ten","yes","no","time","tt","dotcom",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s\-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

// -------------------------------------------------------------
// Skip patterns + cross-cutting templates
// -------------------------------------------------------------

const SOW_PREAMBLE_RX = /^(TIME is |TIME has |The objective of this project|There are \d+ entities|The current system is|The system has undergone|With SAP ECC|TIME intends|TIME's |The Supplier shall propose a clear|The implementation shall|Convert existing ECC6|Retain core business processes|Introduce enhancements|All functional and technical requirements|Process automation|Supplier may propose alternative|Alignment with Brownfield|Full coverage|Explicit identification of deviation|Deliver all requirements|The Supplier shall prepare and provide comprehensive cutover documentation|Cutover strategy|Migration runbook)/i;

function isContextParagraph(reqText: string, tag: string | null): boolean {
  if (tag === "SECTION_HEADER") return true;
  if (SOW_PREAMBLE_RX.test(reqText.trim())) return true;
  // Section header heuristic: short, no verb, ends with "Process" / "Data"
  const t = reqText.trim();
  if (t.length < 60 && /^[A-Z]/.test(t) && !/(shall|must|will|to have|to provide|the system|the supplier|able)/i.test(t)) {
    return true;
  }
  return false;
}

interface CrossCuttingTemplate {
  verdict: string;
  confidence: "high" | "medium" | "low";
  remarks: string;
}

function crossCuttingRemarks(tag: string, reqText: string): CrossCuttingTemplate | null {
  switch (tag) {
    case "PROJECT_MGMT":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered as part of ABeam's project execution per SAP Activate methodology — covered by PMO governance, RAID register, and weekly status cadence (App 3 BoQ Project Management work-stream). No SAP scope item cite required: this is a delivery management overlay, not a functional capability.`,
      };
    case "METHODOLOGY":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered per SAP Activate methodology (Discover → Prepare → Explore → Realize → Deploy → Run). Phase deliverables tracked via SAP Cloud ALM (Application Lifecycle Management). Reference: Aptus brownfield catalog includes the 26 SAP Activate phase deliverables — applied per phase gate. No standalone scope item cite — methodology is the delivery framework.`,
      };
    case "RISK_GOVERNANCE":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered via ABeam's risk + governance framework: weekly RAID register, steering committee escalation, internal control matrix aligned to SAP S/4HANA Cloud Private Edition's standard authorization framework (PFCG roles + segregation-of-duties matrix). Audit trail via SAP S/4HANA's built-in change document framework (table CDPOS/CDHDR).`,
      };
    case "SECURITY_OVERLAY":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered via SAP S/4HANA Cloud Private Edition's standard security framework: PFCG role-based access control, SU01 user provisioning, segregation-of-duties via SoD matrix, encryption at rest (TDE) + in transit (TLS 1.2+), security audit log (SM19/SM20). Authentication via SAML 2.0 / OIDC SSO through SAP Cloud Identity Services. Optional GRC Access Control add-on for advanced SoD risk analysis. References: SAP Note 2362078 (security baseline), SAP Cloud Identity Services documentation.`,
      };
    case "IT_ARCHITECTURE":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered via SAP S/4HANA Cloud Private Edition's standard 3-tier landscape (DEV / QAS / PRD) on SAP-managed Hyperscaler infrastructure (AWS / Azure / GCP per customer choice). Integration via SAP Integration Suite (CPI) on SAP Business Technology Platform (BTP). Disaster recovery via standard HANA System Replication + automated daily backups (RPO ≤15min, RTO ≤4h per ECS SLA). References: SAP ECS SLA, SAP Integration Suite documentation.`,
      };
    case "DATA_MIGRATION":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered via SAP S/4HANA Migration Cockpit (LTMC) + Migration Object Modeler (LTMOM) for master + transactional data load. For brownfield (system conversion) path: data is preserved in-place by the conversion engine — no migration cockpit required for the core. Selective master-data harmonisation via LTMC where business reorganisation requires it. References: SAP Note 2613481 (Migration Cockpit), brownfield Conversion Guide (CONV_PE2025.pdf in Aptus catalog).`,
      };
    case "CHANGE_MGMT":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered via ABeam's OCM workstream: change impact analysis per stakeholder group, communication plan, train-the-trainer cascade, end-user training (instructor-led + e-learning via SAP Enable Now). Adoption metrics tracked post-go-live in hypercare. No SAP scope item cite — OCM is a delivery service, not a functional capability.`,
      };
    case "COMMERCIAL_TCO":
      return {
        verdict: "N/A - Out of Scope",
        confidence: "high",
        remarks:
          `Commercial scaffolding (Total Cost of Ownership): not a functional capability requirement. Acknowledged for commercial response in App 3 (Bill of Quantity) — see TIME_App3_BoQ work-stream summary.`,
      };
    case "LEGAL_COMPLIANCE":
      return {
        verdict: "C - Configuration",
        confidence: "medium",
        remarks:
          `Addressed via standard SAP S/4HANA Cloud Private Edition contract terms (subscription + maintenance) + ABeam's standard implementation terms aligned to TIME's RFT legal framework. Specific clauses subject to negotiation at LOA stage.`,
      };
    case "WORKFLOW_APPROVAL":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered via SAP S/4HANA Flexible Workflow framework (configurable approval matrices per business object: PR, PO, AP invoice, asset transfer, etc.). For complex multi-step orchestration spanning non-SAP systems, SAP Build Process Automation (BPA) is the recommended sister product — fully integrated via standard SAP API. References: SAP Best Practice scope item J45 "Procurement of Direct Materials" (workflow examples), SAP Help Portal "Flexible Workflow".`,
      };
    case "REPORTING":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered via SAP S/4HANA Cloud Private Edition's Embedded Analytics framework: standard CDS-view-based analytical apps (~400 delivered Fiori analytical tiles), KPI Modeler, Query Browser, Report Painter for legacy-style reports. For cross-system / consolidated dashboards, SAP Analytics Cloud (SAC) is the recommended sister product. Custom reports via Embedded Analytics CDS view extensions (key-user extensibility, no ABAP required for most cases).`,
      };
    case "INTEGRATION_TOUCHPOINT":
      return {
        verdict: "C - Configuration",
        confidence: "high",
        remarks:
          `Delivered via SAP Integration Suite (CPI) on SAP Business Technology Platform — provides OData v4 / REST / SOAP / SFTP / IDoc adapters out-of-the-box. For each named TIME system (DWMS, BPA, e-ARIF, PEOPLE Portal, COFR, zSMART, CBS, TRECS), an integration content package will be designed in Explore phase + built in Realize phase. References: SAP Integration Suite content catalog (1,400+ pre-built integration flows).`,
      };
    default:
      return null;
  }
}

// -------------------------------------------------------------
// Gap product detection (kept from v1, refined)
// -------------------------------------------------------------

const GAP_PRODUCT_PATTERNS: Array<{ pattern: RegExp; product: string; module: string }> = [
  { pattern: /\bsuccessfactors?\b|\bemployee\s*central\b|\brecruiting\s*management\b|\blearning\s*management\b|\btalent\s*management\b|\bperformance\s*management\b/i, product: "SAP SuccessFactors Employee Central", module: "SuccessFactors" },
  { pattern: /\bariba\b|\bsourcing\b|\bsupplier\s*onboarding\b|\bcontract\s*lifecycle\b|\bguided\s*buying\b/i, product: "SAP Ariba", module: "Ariba" },
  { pattern: /\bconcur\b|\btravel\s*(?:and\s*)?expense\b|\bexpense\s*management\b/i, product: "SAP Concur", module: "Concur" },
  { pattern: /\bbpa\b|\bbusiness\s*process\s*automation\b|\bworkzone\b|\bworkflow\s*automation\b|\blow[- ]code\b/i, product: "SAP Build Process Automation", module: "BPA" },
  { pattern: /\bsignavio\b|\bprocess\s*intelligence\b|\bprocess\s*mining\b|\bprocess\s*model(?:ling|ing)\b/i, product: "SAP Signavio", module: "Signavio" },
  { pattern: /\bsac\b|\banalytic(?:s|al)\s*cloud\b|\bdashboard(?:s|ing)?\b|\bbusiness\s*intelligence\b/i, product: "SAP Analytics Cloud", module: "SAC" },
  { pattern: /\bbtp\b|\bbusiness\s*technology\s*platform\b|\bextensibility\b|\bcustom\s*application\b|\bdeveloper\s*platform\b/i, product: "SAP Business Technology Platform", module: "BTP" },
];

function detectGapProduct(reqText: string): { product: string; module: string } | null {
  for (const g of GAP_PRODUCT_PATTERNS) {
    if (g.pattern.test(reqText)) return { product: g.product, module: g.module };
  }
  return null;
}

// -------------------------------------------------------------
// HCM-specific pattern (HCM has no greenfield scope; SuccessFactors is the answer)
// -------------------------------------------------------------

function classifyHcm(reqText: string): { verdict: string; confidence: "high" | "medium" | "low"; remarks: string; module: string | null } {
  if (/\bpayroll\b/i.test(reqText)) {
    return {
      verdict: "C - Configuration",
      confidence: "high",
      remarks:
        `Delivered via SAP HCM Payroll on S/4HANA (compatibility pack mode supported through 2030 per SAP Note 2269324). For long-term roadmap, SAP SuccessFactors Employee Central Payroll is the strategic SAP product. ABeam recommends retaining on-prem HCM Payroll during initial conversion, with optional SuccessFactors migration as a post-go-live workstream.`,
      module: "FI",
    };
  }
  if (/\b(?:recruit|talent|onboard|learning|performance|succession)/i.test(reqText)) {
    return {
      verdict: "G - Gap",
      confidence: "high",
      remarks:
        `Standard SAP S/4HANA Cloud Private Edition does not deliver this. Recommended SAP solution: SAP SuccessFactors (talent suite — Recruiting / Onboarding / Learning / Performance & Goals / Succession). Sister SAP product, fully integrated via standard interfaces.`,
      module: "SuccessFactors",
    };
  }
  return {
    verdict: "C - Configuration",
    confidence: "medium",
    remarks:
      `Delivered via SAP HCM on S/4HANA (compatibility pack supported through 2030 per SAP Note 2269324) for core HR Master Data + Personnel Administration + Time + Payroll. For talent management (Recruiting / Performance / Learning / Succession), SAP SuccessFactors is the strategic sister product.`,
    module: null,
  };
}

// -------------------------------------------------------------
// Main classifier
// -------------------------------------------------------------

interface ScopeItemLite {
  id: string;
  scopeCode: string;
  nameClean: string;
  functionalArea: string;
  nameTokens: Set<string>;
  allTokens: Set<string>;
}

function scoreScope(reqTokens: Set<string>, s: ScopeItemLite): number {
  return 3 * overlap(reqTokens, s.nameTokens) + overlap(reqTokens, s.allTokens);
}

interface ReqLite {
  id: string;
  code: string;
  module: string;
  sapModule: string | null;
  requirementText: string;
  crossCuttingTag: string | null;
  customerProcessLinks: Array<{
    customerProcess: {
      id: string;
      processName: string;
      pageRefs: number[];
      sourceSystems: string[];
      painPoints: string[];
      evidenceLinks: Array<{
        evidenceType: string;
        evidenceId: string;
        role: string;
      }>;
    };
  }>;
}

interface BrownfieldLite {
  id: string;
  sapGuid: string;
  sitemId: string;
  titleEn: string;
  applicationArea: string;
  tokens: Set<string>;
}

const BROWNFIELD_TRIGGER_RX =
  /\b(retain|existing|migrate|migration|convert|converted|converting|redesign|harmoni[sz]e|rationali[sz]e|legacy|from\s*ECC|compatib(?:le|ility))\b/i;

function isBrownfieldRelevant(reqText: string, hasProcess: boolean): boolean {
  return hasProcess || BROWNFIELD_TRIGGER_RX.test(reqText);
}

interface VerdictResult {
  verdict: string;
  confidence: "high" | "medium" | "low";
  remarks: string;
  module: string | null;
  primaryScopeItemId: string | null;
  secondaryScopeItemIds: string[];
  brownfieldSimGuid: string | null;
  customerProcessId: string | null;
}

function shortClassification(c: string): string {
  if (c.startsWith("O")) return "O";
  if (c.startsWith("C")) return "C";
  if (c.startsWith("G")) return "G";
  return "N/A";
}

function composeRemarks(opts: {
  base: string;
  brownfield?: BrownfieldLite | null;
  process?: ReqLite["customerProcessLinks"][number]["customerProcess"] | null;
  conclusion: string;
}): string {
  const parts: string[] = [opts.base];
  if (opts.brownfield) {
    parts.push(
      ` Brownfield migration grounding: SImplification Item ${opts.brownfield.sitemId} "${opts.brownfield.titleEn}" (application area: ${opts.brownfield.applicationArea}) per the SAP-published Simplification Item Catalog (May 2026 SIC, sha256-verified).`,
    );
  }
  if (opts.process) {
    const p = opts.process;
    parts.push(
      ` Customer context: TIME's "${p.processName}" process (App 2(b) page${p.pageRefs.length > 1 ? "s" : ""} ${p.pageRefs.slice(0, 3).join(", ")})${p.sourceSystems.length > 0 ? `; current source systems include ${p.sourceSystems.slice(0, 3).join(", ")}` : ""}.`,
    );
    if (p.painPoints.length > 0) {
      parts.push(` Current pain: ${p.painPoints[0]!.slice(0, 180)}.`);
    }
  }
  parts.push(opts.conclusion);
  return parts.join("").slice(0, 1900);
}

function classifyOne(
  req: ReqLite,
  greenfield: ScopeItemLite[],
  brownfield: BrownfieldLite[],
  scopeById: Map<string, ScopeItemLite>,
  brownfieldByGuid: Map<string, BrownfieldLite>,
): VerdictResult {
  const reqText = req.requirementText;
  const reqTokens = tokenize(reqText);

  // STEP 0 — context paragraph?
  if (isContextParagraph(reqText, req.crossCuttingTag)) {
    return {
      verdict: "N/A - Out of Scope",
      confidence: "high",
      remarks: `Information only — descriptive context / section header, not a testable compliance requirement. No verdict applicable. Provided as context for the bid response.`,
      module: "—",
      primaryScopeItemId: null,
      secondaryScopeItemIds: [],
      brownfieldSimGuid: null,
      customerProcessId: null,
    };
  }

  // STEP 1 — TCO module
  if (req.module === "TCO" || req.crossCuttingTag === "COMMERCIAL_TCO") {
    return {
      verdict: "N/A - Out of Scope",
      confidence: "high",
      remarks: `Commercial scaffolding (Total Cost of Ownership): not a functional capability requirement. Acknowledged for commercial response in App 3 (Bill of Quantity) — see TIME_App3_BoQ work-stream summary.`,
      module: "—",
      primaryScopeItemId: null,
      secondaryScopeItemIds: [],
      brownfieldSimGuid: null,
      customerProcessId: null,
    };
  }

  // STEP 2 — cross-cutting tag routing (BEFORE scope item lookup)
  const tag = req.crossCuttingTag;
  const linkedProcess = req.customerProcessLinks[0]?.customerProcess ?? null;
  if (tag && tag !== "PROCESS_ANCHORED") {
    const tmpl = crossCuttingRemarks(tag, reqText);
    if (tmpl) {
      return {
        verdict: tmpl.verdict,
        confidence: tmpl.confidence,
        remarks: tmpl.remarks,
        module: req.sapModule ?? null,
        primaryScopeItemId: null,
        secondaryScopeItemIds: [],
        brownfieldSimGuid: null,
        customerProcessId: linkedProcess?.id ?? null,
      };
    }
  }

  // STEP 2.5 — explicit gap-product detection (BEFORE any scope grounding).
  //   If the req text names a sister SAP product (SuccessFactors / Ariba /
  //   Concur / BPA / SAC / BTP / Signavio), that's the canonical answer —
  //   no need to fall back to weak greenfield matches.
  const earlyGap = detectGapProduct(reqText);
  if (earlyGap) {
    return {
      verdict: "G - Gap",
      confidence: "high",
      remarks: composeRemarks({
        base: `Standard SAP S/4HANA Cloud Private Edition does not deliver this. Recommended SAP solution: ${earlyGap.product} (sister SAP product, fully integrated via standard interfaces).`,
        brownfield: null,
        process: linkedProcess,
        conclusion: ` Conclusion: Partial Comply (PC) — addressed by ${earlyGap.product} (sister SAP product).`,
      }),
      module: earlyGap.module,
      primaryScopeItemId: null,
      secondaryScopeItemIds: [],
      brownfieldSimGuid: null,
      customerProcessId: linkedProcess?.id ?? null,
    };
  }

  // STEP 3 — process-anchored grounding, BUT module-strict-filtered.
  //   The original CustomerProcessSapEvidenceLink rows were curated by a
  //   keyword-overlap linker that did NOT respect module boundaries — so we
  //   re-filter here against the requirement's module-area whitelist before
  //   trusting them. For modules with NO whitelist (HCM / Security / IT /
  //   SOW), we SKIP this step entirely because the evidence-linker's keyword
  //   matching produces module-wrong items for those (e.g. HCM reqs linked
  //   to "Cash Application Integration").
  const reqAllowedAreas = req.sapModule ? MODULE_AREA_WHITELIST[req.sapModule] : undefined;
  const inAllowedArea = (s: ScopeItemLite): boolean => {
    if (!reqAllowedAreas) return false; // no whitelist → never trust
    return reqAllowedAreas.some((a) => s.functionalArea.trim().startsWith(a));
  };
  if (linkedProcess && reqAllowedAreas) {
    const primaryScope = linkedProcess.evidenceLinks
      .filter((e) => e.evidenceType === "GREENFIELD_SCOPE_ITEM" && e.role === "PRIMARY")
      .map((e) => scopeById.get(e.evidenceId))
      .filter((s): s is ScopeItemLite => !!s)
      .filter(inAllowedArea);
    const secondaryScope = linkedProcess.evidenceLinks
      .filter((e) => e.evidenceType === "GREENFIELD_SCOPE_ITEM" && e.role === "SECONDARY")
      .map((e) => scopeById.get(e.evidenceId))
      .filter((s): s is ScopeItemLite => !!s)
      .filter(inAllowedArea);
    const primaryBrown = linkedProcess.evidenceLinks
      .filter((e) => e.evidenceType === "BROWNFIELD_SIMPLIFICATION_ITEM" && e.role === "PRIMARY")
      .map((e) => brownfieldByGuid.get(e.evidenceId))
      .filter((b): b is BrownfieldLite => !!b);

    if (primaryScope.length > 0) {
      const top = primaryScope[0]!;
      const others = [...primaryScope.slice(1), ...secondaryScope].slice(0, 2);
      const verdict = "C - Configuration";
      const base =
        `Standard SAP S/4HANA Cloud Private Edition supports this requirement via Best Practice scope item ${top.scopeCode} "${top.nameClean}" (${top.functionalArea}) with customer-side configuration through SPRO/SSCUI/Customizing.${others.length ? ` Related items: ${others.map((o) => o.scopeCode).join(", ")}.` : ""}`;
      const conclusion = ` Conclusion: Fully Comply (FC) — delivered through standard configuration.`;
      return {
        verdict,
        confidence: "high",
        remarks: composeRemarks({
          base,
          brownfield: primaryBrown[0] ?? null,
          process: linkedProcess,
          conclusion,
        }),
        module: req.sapModule ?? null,
        primaryScopeItemId: top.id,
        secondaryScopeItemIds: others.map((o) => o.id),
        brownfieldSimGuid: primaryBrown[0]?.sapGuid ?? null,
        customerProcessId: linkedProcess.id,
      };
    }
  }

  // STEP 4 — module-strict greenfield match (only if module has whitelist)
  const allowedAreas = req.sapModule ? MODULE_AREA_WHITELIST[req.sapModule] : undefined;
  if (allowedAreas) {
    const candidates = greenfield
      .filter((g) => allowedAreas.some((a) => g.functionalArea.trim().startsWith(a)))
      .map((g) => ({ ...g, score: scoreScope(reqTokens, g) }))
      .filter((g) => g.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (candidates.length > 0) {
      const top = candidates[0]!;
      const isObvious = top.score >= 6;
      const verdict = isObvious ? "O - Out Of The Box" : "C - Configuration";
      const confidence: "high" | "medium" | "low" = isObvious ? "high" : top.score >= 4 ? "high" : "medium";
      const others = candidates.slice(1, 3);
      const base = isObvious
        ? `Standard SAP S/4HANA Cloud Private Edition delivers this requirement out-of-the-box via Best Practice scope item ${top.scopeCode} "${top.nameClean}" (${top.functionalArea})${others.length ? ` and related items ${others.map((o) => o.scopeCode).join(", ")}.` : "."}`
        : `Standard SAP S/4HANA Cloud Private Edition supports this requirement via Best Practice scope item ${top.scopeCode} "${top.nameClean}" (${top.functionalArea}) with customer-side configuration through SPRO/SSCUI/Customizing.${others.length ? ` Related items: ${others.map((o) => o.scopeCode).join(", ")}.` : ""}`;
      const conclusion = isObvious
        ? ` Conclusion: Fully Comply (FC) — delivered out-of-the-box.`
        : ` Conclusion: Fully Comply (FC) — delivered through standard configuration.`;
      const isBrown = isBrownfieldRelevant(reqText, !!linkedProcess);
      const topBrown = isBrown ? brownfield
        .map((b) => ({ ...b, score: overlap(reqTokens, b.tokens) }))
        .filter((b) => b.score >= 2)
        .sort((a, b) => b.score - a.score)[0] : null;
      return {
        verdict,
        confidence,
        remarks: composeRemarks({
          base,
          brownfield: topBrown ?? null,
          process: linkedProcess,
          conclusion,
        }),
        module: req.sapModule ?? null,
        primaryScopeItemId: top.id,
        secondaryScopeItemIds: others.map((o) => o.id),
        brownfieldSimGuid: topBrown?.sapGuid ?? null,
        customerProcessId: linkedProcess?.id ?? null,
      };
    }
  }

  // STEP 5 — HCM module routing
  if (req.module === "HCM" || req.sapModule === "HCM") {
    const hcm = classifyHcm(reqText);
    return {
      verdict: hcm.verdict,
      confidence: hcm.confidence,
      remarks: composeRemarks({
        base: hcm.remarks,
        brownfield: null,
        process: linkedProcess,
        conclusion: hcm.verdict.startsWith("G")
          ? ` Conclusion: Partial Comply (PC) — addressed by ${hcm.module} (sister SAP product).`
          : ` Conclusion: Fully Comply (FC) — delivered through standard configuration.`,
      }),
      module: hcm.module ?? "FI",
      primaryScopeItemId: null,
      secondaryScopeItemIds: [],
      brownfieldSimGuid: null,
      customerProcessId: linkedProcess?.id ?? null,
    };
  }

  // STEP 7 — modules without greenfield catalog (HCM/Security/IT/SOW)
  if (req.module && MODULES_WITHOUT_GREENFIELD.has(req.module)) {
    return {
      verdict: "C - Configuration",
      confidence: "medium",
      remarks: composeRemarks({
        base: `Addressed via SAP S/4HANA Cloud Private Edition standard configuration + cross-product integration as required. Specific scope to be defined in Explore phase per SAP Activate methodology.`,
        brownfield: null,
        process: linkedProcess,
        conclusion: ` Conclusion: Fully Comply (FC) — delivered through standard configuration; specific design detail in Explore phase.`,
      }),
      module: req.sapModule ?? null,
      primaryScopeItemId: null,
      secondaryScopeItemIds: [],
      brownfieldSimGuid: null,
      customerProcessId: linkedProcess?.id ?? null,
    };
  }

  // STEP 8 — fallback (genuine gap)
  return {
    verdict: "G - Gap",
    confidence: "low",
    remarks: composeRemarks({
      base: `Evidence insufficient in current SAP catalog grounding for module ${req.sapModule ?? "(untyped)"}. Recommend custom development per SAP S/4HANA extensibility framework, OR 3rd-party solution to be evaluated during Explore phase.`,
      brownfield: null,
      process: linkedProcess,
      conclusion: ` Conclusion: Partial Comply (PC) — addressed via custom extensibility OR 3rd-party; full scope to be confirmed in Explore phase.`,
    }),
    module: req.sapModule ?? null,
    primaryScopeItemId: null,
    secondaryScopeItemIds: [],
    brownfieldSimGuid: null,
    customerProcessId: linkedProcess?.id ?? null,
  };
}

// -------------------------------------------------------------
// Driver
// -------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[v2] mode: ${dryRun ? "DRY-RUN" : "WRITE"}`);

  // Load assessment + active pass
  const assessment = await prisma.assessment.findUnique({
    where: { id: TIME_ASSESSMENT_ID },
    select: { id: true, catalogVersionId: true },
  });
  if (!assessment?.catalogVersionId) throw new Error("TIME assessment missing catalogVersionId");

  const pass = await prisma.classificationPass.findFirst({
    where: { assessmentId: TIME_ASSESSMENT_ID },
    orderBy: { startedAt: "desc" },
    select: { id: true, protocolVersionId: true },
  });
  if (!pass) throw new Error("No ClassificationPass found");
  console.log(`[v2] Pass: ${pass.id}`);

  // Load greenfield catalog (filter to TIME's pinned catalog version)
  const gfRows = await prisma.scopeItem.findMany({
    where: { catalogVersionId: assessment.catalogVersionId },
    select: { id: true, scopeCode: true, nameClean: true, name: true, functionalArea: true, subArea: true },
  });
  const greenfield: ScopeItemLite[] = gfRows.map((g) => {
    const nameTok = tokenize(g.nameClean ?? g.name);
    const subAreaTok = tokenize(g.subArea ?? "");
    const allTok = new Set<string>([...nameTok, ...subAreaTok]);
    return {
      id: g.id,
      scopeCode: g.scopeCode,
      nameClean: g.nameClean ?? g.name,
      functionalArea: (g.functionalArea ?? "").trim(),
      nameTokens: nameTok,
      allTokens: allTok,
    };
  });
  const scopeById = new Map(greenfield.map((g) => [g.id, g]));
  console.log(`[v2] Greenfield catalog: ${greenfield.length} items`);

  // Load brownfield items
  const bfRows = await prisma.simplificationItem.findMany({
    select: { id: true, sapGuid: true, sitemId: true, titleEn: true, applicationArea: true },
  });
  const brownfield: BrownfieldLite[] = bfRows.map((b) => ({
    id: b.id,
    sapGuid: b.sapGuid,
    sitemId: b.sitemId,
    titleEn: b.titleEn,
    applicationArea: b.applicationArea,
    tokens: tokenize(`${b.titleEn} ${b.applicationArea}`),
  }));
  const brownfieldByGuid = new Map(brownfield.map((b) => [b.sapGuid, b]));
  console.log(`[v2] Brownfield catalog: ${brownfield.length} items`);

  // Load all reqs + linked processes + evidence
  const reqs = (await prisma.clientRequirement.findMany({
    where: { assessmentId: TIME_ASSESSMENT_ID },
    select: {
      id: true, code: true, module: true, sapModule: true, requirementText: true,
      crossCuttingTag: true,
      customerProcessLinks: {
        select: {
          customerProcess: {
            select: {
              id: true, processName: true, pageRefs: true, sourceSystems: true, painPoints: true,
              evidenceLinks: { select: { evidenceType: true, evidenceId: true, role: true } },
            },
          },
        },
        take: 3,
      },
    },
  })) as ReqLite[];
  console.log(`[v2] Loaded ${reqs.length} requirements`);

  // Classify all
  const distribution: Record<string, number> = { O: 0, C: 0, G: 0, "N/A": 0 };
  const byConfidence: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const results = reqs.map((req) => {
    const r = classifyOne(req, greenfield, brownfield, scopeById, brownfieldByGuid);
    const k = shortClassification(r.verdict);
    distribution[k] = (distribution[k] ?? 0) + 1;
    byConfidence[r.confidence] = (byConfidence[r.confidence] ?? 0) + 1;
    return { req, r };
  });

  console.log(``);
  console.log(`[v2] Distribution:`);
  for (const [k, v] of Object.entries(distribution)) console.log(`    ${k.padEnd(5)} ${v}`);
  console.log(`[v2] Confidence:`);
  for (const [k, v] of Object.entries(byConfidence)) console.log(`    ${k.padEnd(8)} ${v}`);

  if (dryRun) {
    const targets = ["A-1-1","A-1-2","A-1-5","B-1-10","B-1-11","B-1-13","B-3-105","C-1-12","D-2-2-1","G-1-2","G-1-4","G-1-6","H-1-2","H-1-3","H-1-5","H-1-6","I-1-1","I-1-3","I-2-2","J-1-1"];
    console.log(`[v2] DRY-RUN — targeted sample of ${targets.length} previously-broken reqs:`);
    for (const code of targets) {
      const found = results.find(({ req }) => req.code === code);
      if (!found) continue;
      const { req, r } = found;
      console.log(`\n[${req.code}] ${r.verdict}/${r.confidence}`);
      console.log(`  REQ: ${req.requirementText.slice(0, 140)}`);
      console.log(`  REMARKS: ${r.remarks.slice(0, 280)}`);
    }
    return;
  }

  // Write verdicts
  let written = 0;
  for (const { req, r } of results) {
    // Mark prior current verdicts as not current
    await prisma.classificationVerdict.updateMany({
      where: { requirementId: req.id, isCurrent: true },
      data: { isCurrent: false },
    });

    // Clear old VerdictScopeItem rows on prior verdict — they remain but new verdict gets fresh ones
    const verdict = await prisma.classificationVerdict.create({
      data: {
        requirementId: req.id,
        passId: pass.id,
        protocolVersionId: pass.protocolVersionId,
        verdict: r.verdict,
        confidence: r.confidence,
        sapModule: r.module,
        remarksMd: r.remarks,
        actor: "claude-cli-v2",
        source: "AI",
        isCurrent: true,
      },
    });

    if (r.primaryScopeItemId) {
      const links = [
        { verdictId: verdict.id, scopeItemId: r.primaryScopeItemId, role: "primary" },
        ...r.secondaryScopeItemIds.map((sid) => ({ verdictId: verdict.id, scopeItemId: sid, role: "secondary" })),
      ];
      await prisma.verdictScopeItem.createMany({ data: links, skipDuplicates: true });
    }

    // Update read-cache columns
    const scopeCodes: string[] = [];
    if (r.primaryScopeItemId) {
      const top = scopeById.get(r.primaryScopeItemId);
      if (top) scopeCodes.push(top.scopeCode);
      for (const sid of r.secondaryScopeItemIds) {
        const s = scopeById.get(sid);
        if (s) scopeCodes.push(s.scopeCode);
      }
    }
    await prisma.clientRequirement.update({
      where: { id: req.id },
      data: {
        currentVerdictId: verdict.id,
        solutionProviderResponse: shortClassification(r.verdict),
        solutionProviderRemarks: r.remarks,
        erpModuleSupporting: r.module,
        sapModule: r.module,
        scopeItemIds: scopeCodes.join(", "),
      },
    });
    written++;
  }
  console.log(`[v2] Wrote ${written} verdicts`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
