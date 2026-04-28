/**
 * Phase 6 — AD-1 + AD-6: classification quality anomaly detector.
 *
 * Catches the exact failure patterns the Bursa correction loop revealed:
 *   1. Verdict says O / C but remarks reference a non-2602 SAP product
 *      (SuccessFactors / Ariba / SAC / BPA / IS / EAM / etc.)
 *   2. Verdict has no scope citations even though it's O or C
 *   3. Cited scope IDs don't exist in the catalog (caught by AD-6 FK at
 *      write time going forward; this scans legacy rows for backfill)
 *   4. Low-confidence verdicts that haven't been reviewed
 *   5. Vendor verdict and Aptus verdict disagree (uses Phase 4 comparison)
 *
 * Used by the QA dashboard's "Anomalies" panel.
 */

import { prisma } from "@/lib/db/prisma";
import { bucketOf } from "@/lib/classification/verdict-writer";

export type AnomalyKind =
  | "OOTB_REMARKS_REFERENCE_NON_2602_PRODUCT"
  | "OC_VERDICT_NO_CITATIONS"
  | "STALE_LEGACY_CITATIONS"
  | "LOW_CONFIDENCE_UNREVIEWED"
  | "VENDOR_DISAGREEMENT";

export interface Anomaly {
  kind: AnomalyKind;
  requirementId: string;
  module: string;
  code: string;
  severity: "low" | "medium" | "high";
  detail: string;
}

const NON_2602_PRODUCT_PATTERNS = [
  /successfactors/i,
  /sap ariba/i,
  /sap analytics cloud/i,
  /\bsac\b.*planning|\bsac\b.*smart predict|\bsac\b.*stories/i,
  /sap build process automation\b|\bbpa\b/i,
  /sap commerce cloud/i,
  /smartrecruiters/i,
  /\bec payroll\b/i,
  /sap convergent invoicing/i,
  /sap field ?service management|sap fsm/i,
];

export async function detectAnomalies(assessmentId: string): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  // Fetch all current verdicts on the assessment with the data needed for
  // each heuristic.
  const verdicts = await prisma.classificationVerdict.findMany({
    where: { isCurrent: true, requirement: { assessmentId } },
    include: {
      requirement: {
        select: {
          id: true, module: true, code: true,
          vendorResponses: { take: 1, select: { verdict: true }, orderBy: { importedAt: "desc" } },
        },
      },
      scopeCitations: { select: { scopeItemId: true } },
    },
  });

  const catalogIds = new Set(
    (await prisma.scopeItem.findMany({ select: { id: true } })).map((r) => r.id),
  );

  for (const v of verdicts) {
    const aptusBucket = bucketOf(v.verdict);

    // Pattern 1: O/C verdict but remarks mention a non-2602 product
    if (aptusBucket === "O" || aptusBucket === "C") {
      for (const pattern of NON_2602_PRODUCT_PATTERNS) {
        if (pattern.test(v.remarksMd)) {
          anomalies.push({
            kind: "OOTB_REMARKS_REFERENCE_NON_2602_PRODUCT",
            requirementId: v.requirementId,
            module: v.requirement.module,
            code: v.requirement.code,
            severity: "high",
            detail: `Verdict is "${v.verdict}" but remarks reference ${pattern.source.replace(/\\b/g, "").replace(/\(\?:/g, "(")}. Likely should be Gap.`,
          });
          break;
        }
      }
    }

    // Pattern 2: O/C verdict with no scope citations
    if ((aptusBucket === "O" || aptusBucket === "C") && v.scopeCitations.length === 0) {
      anomalies.push({
        kind: "OC_VERDICT_NO_CITATIONS",
        requirementId: v.requirementId,
        module: v.requirement.module,
        code: v.requirement.code,
        severity: "medium",
        detail: `${aptusBucket} verdict but zero scope citations — every O/C verdict should cite at least one catalog scope item.`,
      });
    }

    // Pattern 3: stale legacy citations not in catalog (FK enforcement
    // catches new ones; legacy rows from pre-Phase-3 may still have these)
    for (const c of v.scopeCitations) {
      if (!catalogIds.has(c.scopeItemId)) {
        anomalies.push({
          kind: "STALE_LEGACY_CITATIONS",
          requirementId: v.requirementId,
          module: v.requirement.module,
          code: v.requirement.code,
          severity: "high",
          detail: `Cited scope ID "${c.scopeItemId}" does not exist in catalog (legacy row pre-AD-6 enforcement).`,
        });
      }
    }

    // Pattern 4: low-confidence + not yet reviewed
    if (v.confidence === "low" && v.source === "AI") {
      anomalies.push({
        kind: "LOW_CONFIDENCE_UNREVIEWED",
        requirementId: v.requirementId,
        module: v.requirement.module,
        code: v.requirement.code,
        severity: "low",
        detail: `AI returned low confidence; needs consultant review.`,
      });
    }

    // Pattern 5: vendor disagreement
    const vendorVerdict = v.requirement.vendorResponses[0]?.verdict;
    if (vendorVerdict) {
      const vendorBucket = bucketOf(vendorVerdict);
      if (vendorBucket && aptusBucket && vendorBucket !== aptusBucket) {
        anomalies.push({
          kind: "VENDOR_DISAGREEMENT",
          requirementId: v.requirementId,
          module: v.requirement.module,
          code: v.requirement.code,
          severity: "low",
          detail: `Vendor said "${vendorBucket}" but Aptus said "${aptusBucket}".`,
        });
      }
    }
  }

  return anomalies;
}

export interface AnomalySummary {
  total: number;
  byKind: Record<AnomalyKind, number>;
  bySeverity: { low: number; medium: number; high: number };
}

export function summariseAnomalies(anomalies: Anomaly[]): AnomalySummary {
  const summary: AnomalySummary = {
    total: anomalies.length,
    byKind: {
      OOTB_REMARKS_REFERENCE_NON_2602_PRODUCT: 0,
      OC_VERDICT_NO_CITATIONS: 0,
      STALE_LEGACY_CITATIONS: 0,
      LOW_CONFIDENCE_UNREVIEWED: 0,
      VENDOR_DISAGREEMENT: 0,
    },
    bySeverity: { low: 0, medium: 0, high: 0 },
  };
  for (const a of anomalies) {
    summary.byKind[a.kind]++;
    summary.bySeverity[a.severity]++;
  }
  return summary;
}
