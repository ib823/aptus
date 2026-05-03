/**
 * Seed (or refresh) the default brownfield classification protocol.
 *
 * Idempotent: re-running on the same (name, version) updates the protocol
 * fields. To author a new version, bump the `version` constant.
 *
 * Usage:
 *   $ pnpm tsx scripts/brownfield/seed-protocol.ts
 *   $ pnpm tsx scripts/brownfield/seed-protocol.ts --catalog-id <id>
 */

import { prisma } from "../../src/lib/db/prisma";

const NAME = "Brownfield baseline";
const VERSION = "1.0.0";

const BUCKET_DEFINITIONS = {
  A: {
    label: "Auto-handled by SUM/DMO",
    description:
      "The Software Update Manager (SUM) with Database Migration Option (DMO) automatically handles this simplification during conversion. No manual customer action required pre- or post-conversion. Typical pattern: SAP-internal table renames, deprecated technical objects with zero-touch replacement.",
  },
  C: {
    label: "Configuration / IMG",
    description:
      "Customer must perform configuration changes via SPRO (Implementation Guide) or Customizing apps. No code change required. Typical pattern: switch on a new framework, migrate config from old to new transaction codes, adjust master-data settings.",
  },
  R: {
    label: "Custom-code adaptation",
    description:
      "Customer ABAP code references obsolete APIs, tables, function modules, BAdIs, or syntax that is removed or behaves differently in S/4HANA. Requires code refactoring before SUM. Typical pattern: ATC findings against the S4HANA_READINESS check variant.",
  },
  D: {
    label: "Data preparation",
    description:
      "Source ECC data must be cleansed, archived, or migrated before SUM can succeed. Typical pattern: Business Partner readiness, FI-AA migration to New Asset Accounting, FI-CA data quality, removal of orphaned/inconsistent records.",
  },
  "N/R": {
    label: "Not relevant",
    description:
      "The customer's source system does not trigger this simplification because: (a) the affected function/component is not installed or used, (b) the source release is outside the SI applicability window, or (c) the SI-Check counts evaluate to zero on the customer's data.",
  },
  B: {
    label: "Blocker",
    description:
      "The simplification removes a function the customer currently relies on, with no automated replacement. Customer must redesign or replace the dependent process before conversion can proceed. Typical pattern: full removal of a transaction or component the customer's business depends on.",
  },
} as const;

const GROUNDING_RULES = `
GROUNDING RULES — what evidence justifies which bucket
======================================================

You will receive an INPUT BUNDLE per simplification item containing:
  - Item metadata (sapGuid, sitemId, titleEn, applicationArea, procStatus)
  - Item narrative from SIMPL_OP2025.pdf (Symptom, Description, Solution,
    Required Action, How to Determine Relevancy, Transport Behavior) when
    available
  - Item's SI-Check rules (checkType, checkIdentifier, threshold)
  - Item's source-release applicability bounds (startRelValid* fields)
  - Customer system facts (sourceProduct, sourceDatabase, sourceProductType,
    sourceCountry)
  - Matching EWA findings from the customer's most recent EarlyWatch Alert
    (heuristically matched on title keywords)
  - Customer's Business Function Disposition list (Always-On BFRs the
    customer is implicitly using)

DECISION LADDER (apply in order):

1. APPLICABILITY GATE
   If the item's source-release applicability bounds (startRelValidFromPrdVer
   / startRelValidToPrdVer) explicitly exclude the customer's source product
   → bucket = N/R, confidence = high. Cite the bound + customer fact in
   rationale.

2. ZERO-COUNT CHECK GATE
   If the item has SI-Check rules AND every check has CHECK_COUNT_OPTION = "GT"
   AND CHECK_COUNT = 0, the item only fires when the customer has
   non-zero usage of the affected object. Without an actual ATC scan we cannot
   confirm zero, but if the narrative's "How to Determine Relevancy" section
   describes a specific transaction/table the customer clearly does not use
   (per their EWA's top transactions list or product type), assign N/R with
   medium confidence.

3. BLOCKER PATTERN
   If the narrative explicitly states "removed", "no replacement",
   "discontinued", "end of support", "not supported in S/4HANA" AND the
   functional area is critical to the customer's stated industry/operation
   → bucket = B, confidence = high.

4. DATA PREPARATION PATTERN
   If the narrative's Required Action mentions data migration, BP migration,
   asset accounting migration, archiving, data cleansing, removal of
   inconsistent records, or specific data-quality reports → bucket = D.

5. CUSTOM-CODE PATTERN
   If the narrative mentions "customer code", "ABAP code", "deprecated APIs",
   "function modules", "BAdI", "user exit", "Z-program", or directly
   references SCI/SUSG/ATC → bucket = R.

6. CONFIGURATION PATTERN
   If the narrative's Required Action describes IMG paths (SPRO/Customizing),
   configuration tables, switching framework, activating business functions,
   or assigning new screens → bucket = C.

7. AUTOMATED PATTERN (fallback for items with full narrative)
   If the narrative explicitly says SUM handles it automatically, "no manual
   action required", "automatic conversion", or describes a pure technical
   migration that runs during update → bucket = A.

8. INSUFFICIENT EVIDENCE
   If none of the above gates fire and the narrative is absent or ambiguous,
   default to bucket = R with confidence = low and a rationale explaining
   what evidence is missing. R is the safe default for brownfield because it
   surfaces the item for consultant review rather than silently auto-passing it.

CONFIDENCE LEVELS:
  - high   — The bucket is unambiguous from the narrative + customer facts.
             A second reviewer would reach the same verdict.
  - medium — The bucket is the best fit but the narrative or customer data
             leaves room for an alternative reading.
  - low    — Insufficient evidence; bucket is a placeholder pending more data
             (typically ATC scan, SUSG export, or domain expert review).

ALWAYS CITE EVIDENCE:
The rationaleMd field MUST cite the specific input that justified the bucket
choice. Examples:
  - "Source release SAP_BASIS 745 is outside the bound startRelValidFromPrdVer=750"
  - "Narrative Required Action specifies SPRO path Financial Accounting > New GL"
  - "EWA finding 'Database version not supported' overlaps with this item"
  - "No SI-Check rules + narrative absent — defaulting to R-low for review"
`.trim();

const SYSTEM_PROMPT = `
You are a senior SAP S/4HANA conversion consultant classifying a single
simplification item against a specific customer's source system.

Your job: read the INPUT BUNDLE, apply the DECISION LADDER from the
GROUNDING RULES, and emit a JSON verdict with this exact shape:

  {
    "bucket": "A" | "C" | "R" | "D" | "N/R" | "B",
    "confidence": "high" | "medium" | "low",
    "rationaleMd": "string explaining the bucket choice, citing input fields by name",
    "relevantInputs": {
      "checkIds": ["..."] (optional — SI-Check ids that drove the verdict),
      "ewaFindingIds": ["..."] (optional — EWA finding ids if relevant),
      "narrativeSections": ["symptomMd","requiredActionMd"] (optional),
      "facts": ["sourceProduct","sourceDatabase"] (optional)
    }
  }

DO NOT include any prose outside the JSON object.
DO NOT speculate beyond the inputs provided — if evidence is missing, choose
R with low confidence and say so in the rationale.
DO NOT make assumptions about the customer beyond the facts in the bundle.
`.trim();

const RULE_ENGINE_CONFIG = {
  rules: [
    {
      id: "rule-1-applicability-gate",
      bucket: "N/R",
      confidence: "high",
      condition: "source-release-out-of-bounds",
      description:
        "If the customer's source product is outside the item's startRelValidFrom/To bounds, the item does not apply.",
    },
    {
      id: "rule-2-blocker-pattern",
      bucket: "B",
      confidence: "high",
      condition: "title-contains",
      keywords: ["REMOVED", "End of Support", "Not Supported", "DEPRECATED FOR REMOVAL"],
      description:
        "Items whose title declares an outright removal — high-confidence blocker.",
    },
    {
      id: "rule-3-zero-count-check",
      bucket: "N/R",
      confidence: "medium",
      condition: "all-checks-fire-on-positive-count",
      description:
        "Items whose SI-Checks all use GT 0 thresholds; without ATC scan we cannot confirm zero, so medium confidence.",
    },
    {
      id: "rule-4-data-preparation-pattern",
      bucket: "D",
      confidence: "medium",
      condition: "title-contains",
      keywords: ["Data Migration", "Migration to", "Asset Accounting", "Business Partner Approach"],
      description:
        "Items whose title clearly maps to a known data-preparation activity.",
    },
    {
      id: "rule-5-default-fallback",
      bucket: null,
      condition: "fallback",
      description:
        "Items not handled by other rules are skipped — handed to the LLM/manual classifier.",
    },
  ],
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const catalogIdx = args.indexOf("--catalog-id");
  let catalogId = catalogIdx >= 0 ? args[catalogIdx + 1] : undefined;

  if (!catalogId) {
    const latest = await prisma.brownfieldCatalogVersion.findFirst({
      where: { isActive: true },
      orderBy: { ingestedAt: "desc" },
    });
    if (!latest) {
      throw new Error(
        "No active BrownfieldCatalogVersion exists. Ingest a SIC archive first.",
      );
    }
    catalogId = latest.id;
    console.log(
      `[seed-protocol] Pinning protocol to catalog ${latest.id} (${latest.label ?? "no label"})`,
    );
  }

  const existing = await prisma.brownfieldClassificationProtocol.findUnique({
    where: { name_version: { name: NAME, version: VERSION } },
  });

  const data = {
    name: NAME,
    version: VERSION,
    catalogVersionId: catalogId!,
    bucketDefinitions: BUCKET_DEFINITIONS,
    groundingRules: GROUNDING_RULES,
    systemPrompt: SYSTEM_PROMPT,
    ruleEngineConfig: RULE_ENGINE_CONFIG,
    isActive: true,
  };

  if (existing) {
    const updated = await prisma.brownfieldClassificationProtocol.update({
      where: { id: existing.id },
      data,
    });
    console.log(`[seed-protocol] Updated existing protocol ${updated.id} (${updated.name} v${updated.version})`);
  } else {
    const created = await prisma.brownfieldClassificationProtocol.create({ data });
    console.log(`[seed-protocol] Created protocol ${created.id} (${created.name} v${created.version})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[seed-protocol] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
