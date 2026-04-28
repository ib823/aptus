/**
 * Phase 5 — data helpers for the in-app classification workspace.
 *
 * Read-side functions that power the Pass launcher, module sample preview,
 * per-module sign-off, and pass diff views. All write paths go through
 * src/lib/classification/verdict-writer.ts (verdict-writer chokepoint).
 */

import { prisma } from "@/lib/db/prisma";
import { bucketOf, type VerdictBucket } from "@/lib/classification/verdict-writer";

export interface PassSummary {
  id: string;
  startedAt: Date;
  completedAt: Date | null;
  actor: string;
  actorRole: string;
  parentPassId: string | null;
  protocolVersion: { name: string; version: string };
  catalogVersion: { version: string; edition: string };
  verdictCount: number;
  bucketCounts: Record<VerdictBucket, number>;
}

export interface ModuleBucketRollup {
  module: string;
  total: number;
  buckets: Record<VerdictBucket, number>;
  sampleCounts: { highConfidence: number; lowConfidence: number; vendorDisagreement: number };
}

/** List passes for an assessment (newest first). */
export async function listPasses(assessmentId: string): Promise<PassSummary[]> {
  const passes = await prisma.classificationPass.findMany({
    where: { assessmentId },
    orderBy: { startedAt: "desc" },
    include: {
      protocolVersion: { select: { name: true, version: true } },
    },
  });

  // Pull catalog version + verdict counts per pass in parallel
  const summaries = await Promise.all(
    passes.map(async (p) => {
      const [catalog, verdictCount, verdicts] = await Promise.all([
        prisma.scopeCatalogVersion.findUnique({
          where: { id: p.catalogVersionId },
          select: { version: true, edition: true },
        }),
        prisma.classificationVerdict.count({ where: { passId: p.id } }),
        prisma.classificationVerdict.findMany({
          where: { passId: p.id },
          select: { verdict: true },
        }),
      ]);

      const bucketCounts: Record<VerdictBucket, number> = { O: 0, C: 0, G: 0, "N/A": 0 };
      for (const v of verdicts) {
        const b = bucketOf(v.verdict);
        if (b) bucketCounts[b]++;
      }

      return {
        id: p.id,
        startedAt: p.startedAt,
        completedAt: p.completedAt,
        actor: p.actor,
        actorRole: p.actorRole,
        parentPassId: p.parentPassId,
        protocolVersion: p.protocolVersion,
        catalogVersion: catalog ?? { version: "?", edition: "?" },
        verdictCount,
        bucketCounts,
      };
    }),
  );

  return summaries;
}

/** Per-module bucket rollup for the workspace's module picker. */
export async function getModuleRollup(assessmentId: string): Promise<ModuleBucketRollup[]> {
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId },
    select: {
      module: true,
      verdicts: {
        where: { isCurrent: true },
        select: {
          verdict: true,
          confidence: true,
        },
        take: 1,
      },
      vendorResponses: { take: 1, select: { verdict: true } },
    },
  });

  const byModule = new Map<string, ModuleBucketRollup>();
  for (const r of reqs) {
    if (!byModule.has(r.module)) {
      byModule.set(r.module, {
        module: r.module,
        total: 0,
        buckets: { O: 0, C: 0, G: 0, "N/A": 0 },
        sampleCounts: { highConfidence: 0, lowConfidence: 0, vendorDisagreement: 0 },
      });
    }
    const m = byModule.get(r.module)!;
    m.total++;

    const v = r.verdicts[0];
    if (v) {
      const b = bucketOf(v.verdict);
      if (b) m.buckets[b]++;
      if (v.confidence === "high") m.sampleCounts.highConfidence++;
      else if (v.confidence === "low") m.sampleCounts.lowConfidence++;
    }

    const vendor = r.vendorResponses[0];
    if (vendor && v) {
      const vb = bucketOf(vendor.verdict);
      const ab = bucketOf(v.verdict);
      if (vb && ab && vb !== ab) m.sampleCounts.vendorDisagreement++;
    }
  }

  return Array.from(byModule.values()).sort((a, b) => a.module.localeCompare(b.module));
}

/**
 * Per-module sample preview: 10 representative requirements covering the
 * most-confident-O, most-confident-C, most-confident-G, lowest-confidence,
 * vendor-disagreement patterns. Used by the workspace's "review before apply"
 * UX.
 */
export async function getModuleSample(
  assessmentId: string,
  module: string,
  passId: string,
): Promise<Array<{
  requirementId: string;
  code: string;
  requirementText: string;
  verdict: string;
  confidence: string | null;
  sapModule: string | null;
  remarksMd: string;
  vendorDisagreement: boolean;
  reason: "highConfidence" | "lowConfidence" | "vendorDisagreement";
}>> {
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId, module },
    include: {
      verdicts: {
        where: { passId },
        take: 1,
      },
      vendorResponses: { take: 1, select: { verdict: true } },
    },
  });

  const sample: Array<{
    requirementId: string;
    code: string;
    requirementText: string;
    verdict: string;
    confidence: string | null;
    sapModule: string | null;
    remarksMd: string;
    vendorDisagreement: boolean;
    reason: "highConfidence" | "lowConfidence" | "vendorDisagreement";
  }> = [];

  for (const r of reqs) {
    const v = r.verdicts[0];
    if (!v) continue;
    const aptusBucket = bucketOf(v.verdict);
    const vendor = r.vendorResponses[0];
    const vendorBucket = vendor ? bucketOf(vendor.verdict) : null;
    const vendorDisagreement = !!(vendorBucket && aptusBucket && vendorBucket !== aptusBucket);

    let reason: "highConfidence" | "lowConfidence" | "vendorDisagreement" | null = null;
    if (vendorDisagreement) reason = "vendorDisagreement";
    else if (v.confidence === "low") reason = "lowConfidence";
    else if (v.confidence === "high") reason = "highConfidence";

    if (!reason) continue;
    sample.push({
      requirementId: r.id,
      code: r.code,
      requirementText: r.requirementText.length > 200
        ? r.requirementText.slice(0, 200) + "…"
        : r.requirementText,
      verdict: v.verdict,
      confidence: v.confidence,
      sapModule: v.sapModule,
      remarksMd: v.remarksMd,
      vendorDisagreement,
      reason,
    });
  }

  // Take up to 10 samples, prioritising vendor disagreements + low confidence
  const priority = { vendorDisagreement: 0, lowConfidence: 1, highConfidence: 2 };
  return sample.sort((a, b) => priority[a.reason] - priority[b.reason]).slice(0, 10);
}

/**
 * Diff between two passes: which verdicts changed bucket, which were added,
 * which were removed (if any).
 */
export async function getPassDiff(
  assessmentId: string,
  passId: string,
  priorPassId: string,
): Promise<{
  changed: Array<{
    requirementId: string;
    module: string;
    code: string;
    priorVerdict: string;
    newVerdict: string;
    priorBucket: VerdictBucket | null;
    newBucket: VerdictBucket | null;
  }>;
  bucketTransitions: Record<string, number>; // "O→G", "C→O", etc.
  totalChanged: number;
  totalCompared: number;
}> {
  const [thisPass, priorPass] = await Promise.all([
    prisma.classificationVerdict.findMany({
      where: { passId, requirement: { assessmentId } },
      include: { requirement: { select: { module: true, code: true } } },
    }),
    prisma.classificationVerdict.findMany({
      where: { passId: priorPassId, requirement: { assessmentId } },
    }),
  ]);

  const priorByReq = new Map<string, string>();
  for (const v of priorPass) priorByReq.set(v.requirementId, v.verdict);

  const changed: Array<{
    requirementId: string;
    module: string;
    code: string;
    priorVerdict: string;
    newVerdict: string;
    priorBucket: VerdictBucket | null;
    newBucket: VerdictBucket | null;
  }> = [];
  const bucketTransitions: Record<string, number> = {};
  let totalCompared = 0;

  for (const v of thisPass) {
    const prior = priorByReq.get(v.requirementId);
    if (!prior) continue;
    totalCompared++;
    const priorBucket = bucketOf(prior);
    const newBucket = bucketOf(v.verdict);
    if (priorBucket !== newBucket) {
      changed.push({
        requirementId: v.requirementId,
        module: v.requirement.module,
        code: v.requirement.code,
        priorVerdict: prior,
        newVerdict: v.verdict,
        priorBucket,
        newBucket,
      });
      const key = `${priorBucket ?? "?"}→${newBucket ?? "?"}`;
      bucketTransitions[key] = (bucketTransitions[key] ?? 0) + 1;
    }
  }

  return {
    changed,
    bucketTransitions,
    totalChanged: changed.length,
    totalCompared,
  };
}
