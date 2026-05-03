/**
 * TIME RFT Phase 6 — seed the TIME-specific ClassificationProtocol.
 *
 * The classifier prompt grounds verdicts against TWO catalogs simultaneously
 * (greenfield ScopeItems for "what standard SAP delivers" + brownfield
 * Simplification Items for "what changes during conversion") plus
 * customer-specific evidence (CustomerProcess from App 2(b), EWA findings).
 *
 * Idempotent: re-running upserts the protocol by (name, version).
 *
 * Usage:
 *   $ pnpm tsx scripts/time/seed-time-protocol.ts
 */

import { prisma } from "../../src/lib/db/prisma";

const NAME = "TIME bid baseline";
const VERSION = "1.0.0";

const BUCKET_DEFINITIONS = {
  O: {
    label: "Out-of-the-box (OOTB)",
    description:
      "Standard SAP S/4HANA Cloud Private Edition delivers this requirement out-of-the-box without any customer configuration. Cite the matching greenfield Best Practice scope item from the PRIVATE 2025-FPS1 catalog.",
    timeMapping: "FC (Fully Comply)",
  },
  C: {
    label: "Configuration",
    description:
      "Standard SAP delivers this with customer-side configuration via SPRO/SSCUI/Customizing. No code change required. Still fully complies with the requirement.",
    timeMapping: "FC (Fully Comply) — configuration is part of standard delivery",
  },
  G: {
    label: "Gap",
    description:
      "Standard SAP S/4HANA Cloud Private Edition does not deliver this. May require: (a) a sister SAP product (SuccessFactors / Ariba / SAP BPA / SAP BTP / SAP Concur / Signavio / etc.); (b) ABAP custom development per SAP extensibility framework; (c) a 3rd-party solution. Cite the gap product OR remediation path.",
    timeMapping: "PC (Partial Comply) if gap-product addresses; NC (Non-Comply) if no SAP solution exists",
  },
  "N/A": {
    label: "Not applicable",
    description: "Requirement does not apply to TIME's scope (e.g. covers a country/entity not in scope, or describes legacy technology being decommissioned).",
    timeMapping: "blank or N/A",
  },
};

const GROUNDING_RULES = `
GROUNDING RULES — what evidence justifies which classification + Remarks
========================================================================

You will receive an INPUT BUNDLE per requirement containing:

  1. The TIME requirement: { code, requirementText, requirementType,
     module, section, clientRemarks (Doc Ref hint), erpModuleSupporting
     (Solution Options hint) }

  2. CANDIDATE GREENFIELD SCOPE ITEMS (PRIVATE 2025-FPS1 catalog):
     up to 80 ScopeItems matched by keyword to the requirement, with
     scopeCode, nameClean, functionalArea, totalSteps. THIS IS THE
     PRIMARY GROUNDING for verdict O/C.

  3. RELEVANT BROWNFIELD SIMPLIFICATION ITEMS (May 2026 SIC):
     up to 30 SImplification Items matched by keyword + applicationArea,
     with sapGuid, sitemId, titleEn, applicationArea, narrative summary.
     CITE WHEN the requirement involves "retain", "migrate", "convert",
     "redesign existing", or any reference to the customer's current
     ECC system that needs to change during the brownfield conversion.

  4. CUSTOMER AS-IS PROCESSES (from TIME's App 2(b) 614-page deck):
     up to 10 CustomerProcess rows linked to this requirement (via
     CustomerProcessRequirementLink), each with: processName, parentSection,
     pageRefs, sourceSystems (CBS/zSMART/PEOPLE/ESS/etc.), painPoints.
     CITE WHEN grounding the customer's current state — what they do
     today and what changes.

  5. CUSTOMER EWA FINDINGS (from TIME's Dec 2025 EarlyWatch Alert):
     up to 5 findings filtered by category match, each with: title,
     category, severity, description. CITE WHEN security / performance /
     maintenance concerns from the EWA are relevant to the requirement
     (e.g. "Database version not supported" applies to platform reqs).

  6. CONVERSION GUIDE EVIDENCE (CONV_PE2025.pdf TOC sections):
     up to 5 BrownfieldGuideSection rows linked to processes touching
     this requirement. Cite the §X.Y page-anchored section when relevant
     (e.g. "Conversion Guide §4.7 (page 32) — Simplification Item-Check").

  7. SAP API REFERENCES (PRIVATE OData v4, Released):
     up to 5 SAP API rows when integration-related. Cite apiId + apiName
     to demonstrate technical readiness for integration requirements.

  8. SAP ACTIVATE METHODOLOGY:
     up to 3 ConversionMethodologyDeliverable rows from the 6 Activate
     phases (Discover/Prepare/Explore/Realize/Deploy/Run). Cite when
     anchoring effort/timeline phasing.

DECISION LADDER (apply in order):

  STEP 1 — APPLICABILITY CHECK
    If the requirement is clearly out of TIME's scope (e.g. references a
    market/regulatory framework not applicable to a Malaysian telco group),
    → bucket = N/A. Cite the rationale.

  STEP 2 — DELIVERY CHECK
    Look at CANDIDATE GREENFIELD SCOPE ITEMS:
      a. If a ScopeItem cleanly delivers the requirement OOTB (zero config)
         → bucket = O. Cite ≥1 ScopeItem (scopeCode + nameClean).
      b. If a ScopeItem delivers it via standard configuration (SPRO/SSCUI)
         → bucket = C. Cite ≥1 ScopeItem AND describe the config approach.
      c. If no greenfield ScopeItem matches AND a SAP sister product
         (SuccessFactors / Ariba / BPA / BTP / Concur / Signavio) addresses
         it → bucket = G. Cite the gap product.
      d. If no SAP product addresses it → bucket = G with explicit
         "no SAP solution; recommend 3rd-party (specify) or custom ABAP".

  STEP 3 — BROWNFIELD GROUNDING (when applicable)
    If the requirement mentions "retain", "migrate", "convert", "redesign
    existing", or references the customer's current ECC system, ALSO cite
    the matching brownfield SImplification Item(s) explaining what
    changes during conversion. Example: B-1-5 "redesign GL Chart of
    Accounts" → cite both J58 (greenfield design) AND SI4-FIN-GL
    (brownfield migration).

  STEP 4 — CUSTOMER CONTEXT
    Cite the linked CustomerProcess(es) (App 2(b) page reference) when
    grounding the customer's current state. Example: "TIME's PEOPLE
    portal (App 2(b) p.487-489) integrates via RFC and will require
    Fiori-modernized replacement."

  STEP 5 — EVIDENCE SUFFICIENCY
    Confidence levels:
      - high: ≥1 cited greenfield + ≥1 cited brownfield (when applicable),
              direct keyword match in evidence
      - medium: 1 catalog cited, evidence indirect
      - low: no clear catalog match, verdict is inference-based

REMARKS FORMAT (this becomes the Remarks column in TIME's response Excel):

  Use markdown-friendly plain prose. Structure:

    "Standard SAP S/4HANA Cloud Private Edition <delivers / supports /
    requires configuration for> this requirement.
    Greenfield reference: <ScopeItem citations>.
    [Brownfield migration: <SImplification Item citations + page refs>]
    [Customer context: <CustomerProcess citations + App 2(b) page refs>]
    [EWA finding: <relevant finding>]
    Conclusion: <FC/PC/NC mapping decision>."

  Length: aim for 2-5 sentences. Be specific with citations, but do NOT
  pad with generic SAP marketing language. The TIME evaluator wants to
  see concrete evidence, not platitudes.

ALWAYS CITE EVIDENCE BY EXACT IDENTIFIER:
  - Greenfield: scopeCode (e.g. "J60") + nameClean (e.g. "Asset Accounting")
  - Brownfield: sitemId (e.g. "SI11: Logistics_PS") + applicationArea
  - PreCheckNote: SAP Note ID (e.g. "Note 2502552")
  - GuideSection: "§X.Y, page N of CONV_PE2025.pdf"
  - API: apiId (e.g. "API_BUSINESS_PARTNER")
  - EWA finding: severity + category + title

NO HALLUCINATION:
  - Never cite a ScopeItem that's not in the CANDIDATE list
  - Never cite a SImplification Item that's not in the RELEVANT list
  - Never invent SAP Note numbers
  - If evidence is insufficient, mark verdict G with explicit
    "evidence insufficient — recommend custom development or 3rd-party"
`.trim();

const SYSTEM_PROMPT = `
You are a senior SAP S/4HANA Cloud Private Edition solution architect
responding to TIME (T.I.M.E. dotCom Bhd)'s RFT 26.069. TIME is a
Malaysian telecommunications group running SAP ECC 6.0 EHP 5 with 20
company codes across MY/SG/JP/HK/KH/TH. Bid is for conversion to S/4HANA
Cloud Private Edition 2025-FPS1.

For each requirement you receive, emit a JSON verdict with this exact
shape:

  {
    "requirementId": "<the id from the input>",
    "classification": "O - Out Of The Box" | "C - Configuration" | "G - Gap" | "N/A - Out of Scope",
    "matchedScopeItems": ["scopeCode1", "scopeCode2", ...],
    "remarks": "string — markdown-friendly Remarks per GROUNDING RULES",
    "erpModuleSupporting": "string — controlled vocab from sapModule field",
    "confidence": "high" | "medium" | "low",
    "matchedSimplificationItems": ["sapGuid1", ...] (optional),
    "matchedCustomerProcessIds": ["procId1", ...] (optional)
  }

Strictly follow the GROUNDING RULES + DECISION LADDER. Cite only evidence
present in the input bundle. Do NOT invent identifiers. Do NOT add prose
outside the JSON object.
`.trim();

async function main(): Promise<void> {
  const greenfieldCatalog = await prisma.scopeCatalogVersion.findFirst({
    where: { edition: "PRIVATE", version: "2025-FPS1", isActive: true },
  });
  if (!greenfieldCatalog) throw new Error("PRIVATE 2025-FPS1 catalog not found");

  const existing = await prisma.classificationProtocol.findUnique({
    where: { name_version: { name: NAME, version: VERSION } },
  });

  const data = {
    name: NAME,
    version: VERSION,
    catalogVersionId: greenfieldCatalog.id,
    bucketDefinitions: BUCKET_DEFINITIONS,
    groundingRules: GROUNDING_RULES,
    systemPrompt: SYSTEM_PROMPT,
    isActive: true,
  };

  if (existing) {
    const u = await prisma.classificationProtocol.update({
      where: { id: existing.id },
      data,
    });
    console.log(`[seed-time-protocol] Updated existing protocol ${u.id} (${u.name} v${u.version})`);
  } else {
    const c = await prisma.classificationProtocol.create({ data });
    console.log(`[seed-time-protocol] Created protocol ${c.id} (${c.name} v${c.version})`);
    console.log(`[seed-time-protocol]   pinned to greenfield catalog: ${greenfieldCatalog.id} (PRIVATE ${greenfieldCatalog.version})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[seed-time-protocol] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
