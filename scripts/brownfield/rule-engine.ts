/**
 * Deterministic rule engine for brownfield classification.
 *
 * Applies the rules declared in BrownfieldClassificationProtocol.ruleEngineConfig
 * over every (assessment, item) pair. Items handled by a rule get a verdict
 * with source="RULE" and high/medium confidence; items not handled are left
 * unverdicted for the LLM/manual classifier (emit-classification-prompts).
 *
 * Idempotent: re-running for the same pass replaces verdicts (the writer
 * chokepoint flips prior isCurrent → false on each new write).
 *
 * Usage (typically invoked via start-pass.ts):
 *   $ pnpm tsx scripts/brownfield/rule-engine.ts --pass-id <passId>
 */

import { prisma } from "../../src/lib/db/prisma";
import { writeBrownfieldVerdict, type VerdictBucket, type VerdictConfidence } from "../../src/lib/brownfield/verdict-writer";

interface RuleResult {
  bucket: VerdictBucket;
  confidence: VerdictConfidence;
  rationaleMd: string;
  ruleId: string;
}

interface ItemContext {
  itemId: string;
  sapGuid: string;
  sitemId: string;
  titleEn: string;
  applicationArea: string;
  procStatus: string;
  startRelValidFromPrdVer: string | null;
  startRelValidFromStack: string | null;
  startRelValidToPrdVer: string | null;
  startRelValidToStack: string | null;
  checks: Array<{
    id: string;
    checkType: string;
    checkIdentifier: string;
    checkCountOption: string | null;
    checkCount: number | null;
  }>;
}

interface AssessmentContext {
  id: string;
  sourceProduct: string | null;
  sourceProductType: string | null;
}

// -------------------------------------------------------------
// Individual rules (return RuleResult or null if rule doesn't apply)
// -------------------------------------------------------------

/**
 * Rule 1 — Applicability gate.
 * If the item's startRelValid bounds explicitly exclude the customer's
 * source product, the item does not apply → N/R, high confidence.
 *
 * Bounds use SAP's product-version notation:
 *   "*" = unbounded; specific version = "S4CORE 102", "SAP_BASIS 750", etc.
 *
 * For ECC source systems (the typical brownfield input), the customer's
 * product string is "SAP ERP ENHANCE PACKAGE 6.05" or similar — the SIC's
 * START_REL_VALID_FROM_PRD_VER bounds are SAP-internal product codes that
 * don't directly compare. Without a robust mapping table, we ONLY apply this
 * rule when the bounds are explicitly "*" (in which case the rule is a no-op
 * — the item applies broadly).
 *
 * Practical behavior: rule fires only for items with very narrow bounds
 * that the customer's product string clearly doesn't match. For now, we
 * conservatively skip — no false N/R verdicts. This rule will become
 * useful once a product-code mapping table is added in a future commit.
 */
function ruleApplicabilityGate(item: ItemContext, _assessment: AssessmentContext): RuleResult | null {
  // Conservative implementation: only fire if bounds are non-wildcard AND
  // we have unambiguous reason to believe the customer is outside them.
  // Currently no such reason is computable without a product-code mapping
  // table — return null. Documented for the next commit.
  void item;
  return null;
}

/**
 * Rule 2 — Blocker pattern by title keyword.
 * Items whose titleEn declares an outright removal/end-of-support → B, high.
 */
function ruleBlockerPattern(item: ItemContext, _assessment: AssessmentContext): RuleResult | null {
  const blockerKeywords = [
    /\bREMOVED\b/i,
    /\bEnd of Support\b/i,
    /\bNot Supported\b/i,
    /\bDEPRECATED FOR REMOVAL\b/i,
  ];
  const matched = blockerKeywords.find((rx) => rx.test(item.titleEn));
  if (!matched) return null;
  return {
    bucket: "B",
    confidence: "high",
    rationaleMd:
      `Title "${item.titleEn}" matches blocker pattern (regex: ${matched.source}). ` +
      `SAP has removed or discontinued this function — customer must replace or redesign before conversion.`,
    ruleId: "rule-2-blocker-pattern",
  };
}

/**
 * Rule 3 — Zero-count check pattern.
 * If ALL of the item's SI-Checks use CHECK_COUNT_OPTION="GT" with
 * CHECK_COUNT=0, the item only fires when the customer has positive usage
 * of the affected object. Without an ATC scan we can't confirm zero, so
 * mark N/R with medium confidence and explain the assumption.
 */
function ruleZeroCountCheck(item: ItemContext, _assessment: AssessmentContext): RuleResult | null {
  if (item.checks.length === 0) return null;
  const allGtZero = item.checks.every(
    (c) => c.checkCountOption === "GT" && (c.checkCount ?? 0) === 0,
  );
  if (!allGtZero) return null;
  return {
    bucket: "N/R",
    confidence: "medium",
    rationaleMd:
      `All ${item.checks.length} SI-Check rule(s) for this item fire only on positive count (CHECK_COUNT_OPTION=GT, CHECK_COUNT=0). ` +
      `Without an ATC scan against the customer's source system, we conservatively assume zero usage → Not Relevant. ` +
      `Re-classify as a different bucket if a SUSG/ATC export shows non-zero usage.`,
    ruleId: "rule-3-zero-count-check",
  };
}

/**
 * Rule 4 — Data preparation pattern.
 * Title contains a known data-preparation phrase → D, medium confidence.
 */
function ruleDataPreparationPattern(item: ItemContext, _assessment: AssessmentContext): RuleResult | null {
  const dataKeywords = [
    /\bData Migration\b/i,
    /\bMigration to\b/i,
    /\bAsset Accounting\b/i,
    /\bBusiness Partner Approach\b/i,
    /\bData Cleanup\b/i,
    /\bArchiving\b/i,
  ];
  const matched = dataKeywords.find((rx) => rx.test(item.titleEn));
  if (!matched) return null;
  return {
    bucket: "D",
    confidence: "medium",
    rationaleMd:
      `Title "${item.titleEn}" matches data-preparation pattern (regex: ${matched.source}). ` +
      `Source data must be cleansed/migrated before SUM. ` +
      `Confirm scope by reading the narrative's Required and Recommended Action(s) section.`,
    ruleId: "rule-4-data-preparation-pattern",
  };
}

/**
 * Rule 5 — N/A processing-status pattern.
 * Items with PROC_STATUS != "R" (Released) are not yet released and don't
 * apply to released customers → N/R, high.
 */
function ruleNotReleased(item: ItemContext, _assessment: AssessmentContext): RuleResult | null {
  if (item.procStatus === "R") return null;
  return {
    bucket: "N/R",
    confidence: "high",
    rationaleMd:
      `Item PROC_STATUS=${item.procStatus} (not Released). Items in non-Released status do not apply to customers running released SAP code.`,
    ruleId: "rule-5-not-released",
  };
}

const RULES = [
  ruleApplicabilityGate,
  ruleBlockerPattern,
  ruleZeroCountCheck,
  ruleDataPreparationPattern,
  ruleNotReleased,
];

// -------------------------------------------------------------
// Orchestrator
// -------------------------------------------------------------

export async function runRuleEngine(passId: string): Promise<{
  passId: string;
  totalItems: number;
  ruled: number;
  bySource: Record<string, number>;
  byBucket: Record<string, number>;
  unhandled: number;
}> {
  const pass = await prisma.brownfieldClassificationPass.findUnique({
    where: { id: passId },
    include: {
      brownfieldAssessment: {
        select: {
          id: true,
          sourceProduct: true,
          sourceProductType: true,
          status: true,
        },
      },
    },
  });
  if (!pass) throw new Error(`Pass ${passId} not found`);
  if (pass.brownfieldAssessment.status === "signed_off") {
    throw new Error(`Cannot run rule engine on signed-off assessment ${pass.brownfieldAssessment.id}`);
  }

  const items = await prisma.simplificationItem.findMany({
    where: { catalogVersionId: pass.catalogVersionId },
    select: {
      id: true,
      sapGuid: true,
      sitemId: true,
      titleEn: true,
      applicationArea: true,
      procStatus: true,
      startRelValidFromPrdVer: true,
      startRelValidFromStack: true,
      startRelValidToPrdVer: true,
      startRelValidToStack: true,
      checks: {
        select: {
          id: true,
          checkType: true,
          checkIdentifier: true,
          checkCountOption: true,
          checkCount: true,
        },
      },
    },
  });

  console.log(`[rule-engine] Pass ${passId} — evaluating ${items.length} items against ${RULES.length} rules`);

  const assessmentCtx: AssessmentContext = {
    id: pass.brownfieldAssessment.id,
    sourceProduct: pass.brownfieldAssessment.sourceProduct,
    sourceProductType: pass.brownfieldAssessment.sourceProductType,
  };

  let ruled = 0;
  let unhandled = 0;
  const byBucket: Record<string, number> = { A: 0, C: 0, R: 0, D: 0, "N/R": 0, B: 0 };
  const bySource: Record<string, number> = {};

  for (const item of items) {
    const ctx: ItemContext = {
      itemId: item.id,
      sapGuid: item.sapGuid,
      sitemId: item.sitemId,
      titleEn: item.titleEn,
      applicationArea: item.applicationArea,
      procStatus: item.procStatus,
      startRelValidFromPrdVer: item.startRelValidFromPrdVer,
      startRelValidFromStack: item.startRelValidFromStack,
      startRelValidToPrdVer: item.startRelValidToPrdVer,
      startRelValidToStack: item.startRelValidToStack,
      checks: item.checks.map((c) => ({
        id: c.id,
        checkType: c.checkType,
        checkIdentifier: c.checkIdentifier,
        checkCountOption: c.checkCountOption,
        checkCount: c.checkCount,
      })),
    };

    let verdict: RuleResult | null = null;
    for (const rule of RULES) {
      verdict = rule(ctx, assessmentCtx);
      if (verdict) break;
    }

    if (!verdict) {
      unhandled++;
      continue;
    }

    await writeBrownfieldVerdict({
      brownfieldAssessmentId: assessmentCtx.id,
      simplificationItemId: ctx.itemId,
      passId,
      protocolVersionId: pass.protocolVersionId,
      bucket: verdict.bucket,
      confidence: verdict.confidence,
      rationaleMd: verdict.rationaleMd,
      relevantInputs: { ruleId: verdict.ruleId, ruleSource: "rule-engine" },
      actor: "rule-engine",
      source: "RULE",
    });

    ruled++;
    byBucket[verdict.bucket] = (byBucket[verdict.bucket] ?? 0) + 1;
    bySource[verdict.ruleId] = (bySource[verdict.ruleId] ?? 0) + 1;
  }

  // Update pass.summaryJson
  await prisma.brownfieldClassificationPass.update({
    where: { id: passId },
    data: {
      summaryJson: {
        totalItems: items.length,
        ruled,
        unhandled,
        byBucket,
        byRule: bySource,
        ruleEngineCompletedAt: new Date().toISOString(),
      },
    },
  });

  console.log(`[rule-engine] Done.`);
  console.log(`  Total items   : ${items.length}`);
  console.log(`  Ruled         : ${ruled}`);
  console.log(`  Unhandled     : ${unhandled} (handed to LLM/manual)`);
  console.log(`  By bucket     :`, byBucket);
  console.log(`  By rule       :`, bySource);

  return {
    passId,
    totalItems: items.length,
    ruled,
    bySource,
    byBucket,
    unhandled,
  };
}

if (process.argv[1] && process.argv[1].endsWith("rule-engine.ts")) {
  const args = process.argv.slice(2);
  const passIdx = args.indexOf("--pass-id");
  const passId = passIdx >= 0 ? args[passIdx + 1] : undefined;
  if (!passId) {
    console.error("Usage: tsx scripts/brownfield/rule-engine.ts --pass-id <passId>");
    process.exit(1);
  }
  runRuleEngine(passId)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[rule-engine] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
