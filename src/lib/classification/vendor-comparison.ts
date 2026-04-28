/**
 * Phase 4 — AD-2: vendor-vs-Aptus comparison.
 *
 * Given an assessment, produces a per-requirement comparison between the
 * latest VendorResponse (vendor-supplied) and the current ClassificationVerdict
 * (Aptus's independent classification). Powers the "Vendor vs Aptus" report
 * and the QA dashboard's vendor-disagreement count (Phase 6).
 */

import { prisma } from "@/lib/db/prisma";
import { bucketOf, type VerdictBucket } from "@/lib/classification/verdict-writer";

export interface ComparisonRow {
  requirementId: string;
  module: string;
  code: string;
  requirementText: string;
  vendor: {
    submissionId: string;
    vendorName: string;
    submittedAt: Date;
    verdict: string;
    bucket: VerdictBucket | null;
    remarksMd: string | null;
  } | null;
  aptus: {
    verdictId: string;
    verdict: string;
    bucket: VerdictBucket | null;
    confidence: string | null;
    sapModule: string | null;
    actor: string;
    source: string;
    createdAt: Date;
  } | null;
  agreement: "AGREE" | "DISAGREE" | "VENDOR_ONLY" | "APTUS_ONLY" | "NEITHER";
}

export interface ComparisonSummary {
  total: number;
  agree: number;
  disagree: number;
  vendorOnly: number;
  aptusOnly: number;
  neither: number;
  byVendorBucket: Record<string, number>;
  byAptusBucket: Record<string, number>;
}

function classifyAgreement(
  vendor: { bucket: VerdictBucket | null } | null,
  aptus: { bucket: VerdictBucket | null } | null,
): ComparisonRow["agreement"] {
  if (!vendor && !aptus) return "NEITHER";
  if (vendor && !aptus) return "VENDOR_ONLY";
  if (aptus && !vendor) return "APTUS_ONLY";
  if (vendor!.bucket && aptus!.bucket && vendor!.bucket === aptus!.bucket) return "AGREE";
  return "DISAGREE";
}

export async function getVendorVsAptusComparison(assessmentId: string): Promise<{
  rows: ComparisonRow[];
  summary: ComparisonSummary;
}> {
  // Fetch all requirements with their latest vendor response + current verdict
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId },
    select: {
      id: true,
      module: true,
      code: true,
      requirementText: true,
      vendorResponses: {
        orderBy: { importedAt: "desc" },
        take: 1,
        include: {
          submission: { select: { id: true, vendorName: true, submittedAt: true } },
        },
      },
      verdicts: {
        where: { isCurrent: true },
        take: 1,
      },
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });

  const rows: ComparisonRow[] = reqs.map((r) => {
    const vendorResponse = r.vendorResponses[0];
    const verdict = r.verdicts[0];

    const vendor = vendorResponse
      ? {
          submissionId: vendorResponse.submission.id,
          vendorName: vendorResponse.submission.vendorName,
          submittedAt: vendorResponse.submission.submittedAt,
          verdict: vendorResponse.verdict,
          bucket: bucketOf(vendorResponse.verdict),
          remarksMd: vendorResponse.remarksMd,
        }
      : null;

    const aptus = verdict
      ? {
          verdictId: verdict.id,
          verdict: verdict.verdict,
          bucket: bucketOf(verdict.verdict),
          confidence: verdict.confidence,
          sapModule: verdict.sapModule,
          actor: verdict.actor,
          source: verdict.source,
          createdAt: verdict.createdAt,
        }
      : null;

    return {
      requirementId: r.id,
      module: r.module,
      code: r.code,
      requirementText: r.requirementText,
      vendor,
      aptus,
      agreement: classifyAgreement(vendor, aptus),
    };
  });

  const summary: ComparisonSummary = {
    total: rows.length,
    agree: 0,
    disagree: 0,
    vendorOnly: 0,
    aptusOnly: 0,
    neither: 0,
    byVendorBucket: {},
    byAptusBucket: {},
  };
  for (const r of rows) {
    if (r.agreement === "AGREE") summary.agree++;
    else if (r.agreement === "DISAGREE") summary.disagree++;
    else if (r.agreement === "VENDOR_ONLY") summary.vendorOnly++;
    else if (r.agreement === "APTUS_ONLY") summary.aptusOnly++;
    else summary.neither++;

    if (r.vendor?.bucket) {
      summary.byVendorBucket[r.vendor.bucket] = (summary.byVendorBucket[r.vendor.bucket] ?? 0) + 1;
    }
    if (r.aptus?.bucket) {
      summary.byAptusBucket[r.aptus.bucket] = (summary.byAptusBucket[r.aptus.bucket] ?? 0) + 1;
    }
  }

  return { rows, summary };
}
