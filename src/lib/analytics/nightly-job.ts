/** Phase 26: Nightly analytics computation job */

import { prisma } from "@/lib/db/prisma";
import { computeFitRate, mean, median, percentile } from "./benchmark-engine";
import { computePortfolioSummary, computeFitRateByIndustry, computeTopGaps } from "./portfolio-engine";
import { anonymizeGapPatterns } from "./anonymization-engine";

interface NightlyJobResult {
  benchmarksUpdated: number;
  portfolioMetricsUpdated: number;
  errors: string[];
}

/**
 * Compute and upsert a BenchmarkSnapshot for a given industry + companySize combination.
 */
async function computeBenchmarkSnapshot(
  industry: string,
  companySize: string | null,
): Promise<boolean> {
  const qualifyingStatuses = ["in_progress", "completed", "signed_off", "handed_off", "reviewed", "validated"];

  const assessments = await prisma.assessment.findMany({
    where: {
      industry,
      ...(companySize ? { companySize } : {}),
      status: { in: qualifyingStatuses },
      deletedAt: null,
    },
    select: {
      stepResponses: { select: { fitStatus: true } },
      scopeSelections: { where: { selected: true }, select: { id: true } },
      gapResolutions: { select: { gapDescription: true, resolutionType: true } },
      integrationPoints: { select: { interfaceType: true } },
    },
  });

  // Only include assessments with >= 10 classified steps
  const qualifying = assessments.filter((a) => a.stepResponses.length >= 10);
  const sampleSize = qualifying.length;

  // Compute metrics even for small samples (flag in consumer)
  const fitRates: number[] = [];
  const gapRates: number[] = [];
  const configRates: number[] = [];
  const naRates: number[] = [];
  const scopeCounts: number[] = [];

  for (const a of qualifying) {
    const total = a.stepResponses.length;
    const fitCount = a.stepResponses.filter((r) => r.fitStatus.toUpperCase() === "FIT").length;
    const gapCount = a.stepResponses.filter((r) => r.fitStatus.toUpperCase() === "GAP").length;
    const configCount = a.stepResponses.filter((r) => r.fitStatus.toUpperCase() === "CONFIGURE").length;
    const naCount = a.stepResponses.filter((r) => r.fitStatus.toUpperCase() === "NA").length;

    fitRates.push((fitCount / total) * 100);
    gapRates.push((gapCount / total) * 100);
    configRates.push((configCount / total) * 100);
    naRates.push((naCount / total) * 100);
    scopeCounts.push(a.scopeSelections.length);
  }

  const sortedFitRates = [...fitRates].sort((a, b) => a - b);

  // Aggregate gap patterns across all qualifying assessments
  const allGaps = qualifying.flatMap((a) => a.gapResolutions);
  const commonGaps = anonymizeGapPatterns(allGaps).slice(0, 20);

  // Aggregate integration types
  const integrationMap = new Map<string, number>();
  for (const a of qualifying) {
    for (const ip of a.integrationPoints) {
      integrationMap.set(ip.interfaceType, (integrationMap.get(ip.interfaceType) ?? 0) + 1);
    }
  }
  const commonIntegrations = Array.from(integrationMap.entries())
    .map(([type, frequency]) => ({ type, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);

  await prisma.benchmarkSnapshot.upsert({
    where: {
      industry_companySize: {
        industry,
        companySize: companySize ?? "",
      },
    },
    create: {
      industry,
      companySize,
      sampleSize,
      avgFitRate: mean(fitRates),
      avgGapRate: mean(gapRates),
      avgConfigRate: mean(configRates),
      avgNaRate: mean(naRates),
      medianFitRate: sampleSize > 0 ? median(sortedFitRates) : null,
      p25FitRate: sampleSize > 0 ? percentile(sortedFitRates, 25) : null,
      p75FitRate: sampleSize > 0 ? percentile(sortedFitRates, 75) : null,
      commonGaps: commonGaps as object[],
      commonIntegrations: commonIntegrations as object[],
      avgScopeItemCount: mean(scopeCounts),
    },
    update: {
      sampleSize,
      avgFitRate: mean(fitRates),
      avgGapRate: mean(gapRates),
      avgConfigRate: mean(configRates),
      avgNaRate: mean(naRates),
      medianFitRate: sampleSize > 0 ? median(sortedFitRates) : null,
      p25FitRate: sampleSize > 0 ? percentile(sortedFitRates, 25) : null,
      p75FitRate: sampleSize > 0 ? percentile(sortedFitRates, 75) : null,
      commonGaps: commonGaps as object[],
      commonIntegrations: commonIntegrations as object[],
      avgScopeItemCount: mean(scopeCounts),
      computedAt: new Date(),
    },
  });

  return true;
}

/**
 * Compute and upsert PortfolioMetrics for a given organization and period.
 */
async function computePortfolioMetrics(
  organizationId: string,
  period: string,
): Promise<number> {
  const assessments = await prisma.assessment.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      industry: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      stepResponses: { select: { fitStatus: true } },
      gapResolutions: { select: { gapDescription: true, resolutionType: true, priority: true } },
      scopeSelections: { select: { selected: true } },
    },
  });

  const completedStatuses = ["completed", "reviewed", "signed_off", "validated", "handed_off", "archived"];

  // 1. fit_rate
  const assessmentsForSummary = assessments.map((a) => ({
    status: a.status,
    stepResponses: a.stepResponses,
    createdAt: a.createdAt,
    completedAt: completedStatuses.includes(a.status) ? a.updatedAt : null,
  }));
  const summary = computePortfolioSummary(assessmentsForSummary);

  // 2. gap_distribution
  const allGaps = assessments.flatMap((a) => a.gapResolutions);
  const gapDistribution = {
    critical: allGaps.filter((g) => g.priority === "critical").length,
    high: allGaps.filter((g) => g.priority === "high").length,
    medium: allGaps.filter((g) => g.priority === "medium").length,
    low: allGaps.filter((g) => g.priority === "low").length,
  };

  // 3. consultant_utilization
  const uniqueConsultants = new Set(assessments.map((a) => a.createdBy));
  const totalOrgUsers = await prisma.user.count({
    where: { organizationId, role: { in: ["consultant", "partner_lead"] } },
  });

  // 4. scope_coverage
  const scopeCoverages = assessments
    .filter((a) => a.scopeSelections.length > 0)
    .map((a) => {
      const selected = a.scopeSelections.filter((s) => s.selected).length;
      return (selected / a.scopeSelections.length) * 100;
    });
  const avgScopeCoverage = scopeCoverages.length > 0
    ? scopeCoverages.reduce((s, v) => s + v, 0) / scopeCoverages.length
    : 0;

  // 5. FIT rate by industry
  const fitRateByIndustry = computeFitRateByIndustry(
    assessments.map((a) => ({ industry: a.industry, stepResponses: a.stepResponses })),
  );

  // 6. Top gaps
  const topGaps = computeTopGaps(allGaps).slice(0, 20);

  const metrics: Array<{ metricType: string; metricValue: object }> = [
    { metricType: "fit_rate", metricValue: { avgFitRate: summary.avgFitRate } },
    { metricType: "avg_duration", metricValue: { avgDays: summary.avgAssessmentDurationDays } },
    { metricType: "gap_distribution", metricValue: gapDistribution },
    {
      metricType: "consultant_utilization",
      metricValue: {
        activeConsultants: uniqueConsultants.size,
        totalConsultants: totalOrgUsers,
        rate: totalOrgUsers > 0 ? (uniqueConsultants.size / totalOrgUsers) * 100 : 0,
      },
    },
    { metricType: "scope_coverage", metricValue: { avgCoverage: Math.round(avgScopeCoverage * 100) / 100 } },
    {
      metricType: "assessment_volume",
      metricValue: {
        total: summary.totalAssessments,
        active: summary.activeAssessments,
        completed: summary.completedAssessments,
        fitRateByIndustry,
        topGaps,
      },
    },
  ];

  for (const m of metrics) {
    await prisma.portfolioMetric.upsert({
      where: {
        organizationId_metricType_period: {
          organizationId,
          metricType: m.metricType,
          period,
        },
      },
      create: {
        organizationId,
        metricType: m.metricType,
        metricValue: m.metricValue,
        period,
      },
      update: {
        metricValue: m.metricValue,
        computedAt: new Date(),
      },
    });
  }

  return metrics.length;
}

/**
 * Run nightly analytics computation:
 * 1. Compute benchmark snapshots for all industry+companySize combinations
 * 2. Compute portfolio metrics for all organizations with active assessments
 */
export async function runNightlyAnalytics(): Promise<NightlyJobResult> {
  const result: NightlyJobResult = {
    benchmarksUpdated: 0,
    portfolioMetricsUpdated: 0,
    errors: [],
  };

  // Current period
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const period = `${now.getFullYear()}-Q${quarter}`;

  // 1. Get all unique industry + companySize combinations
  const combinations = await prisma.assessment.groupBy({
    by: ["industry", "companySize"],
    where: { deletedAt: null },
  });

  for (const combo of combinations) {
    try {
      await computeBenchmarkSnapshot(combo.industry, combo.companySize);
      result.benchmarksUpdated++;
    } catch (err) {
      result.errors.push(
        `Benchmark ${combo.industry}/${combo.companySize}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  // 2. Get all organizations with assessments
  const orgIds = await prisma.assessment.groupBy({
    by: ["organizationId"],
    where: { deletedAt: null },
  });

  for (const { organizationId } of orgIds) {
    try {
      const metricsCount = await computePortfolioMetrics(organizationId, period);
      result.portfolioMetricsUpdated += metricsCount;
    } catch (err) {
      result.errors.push(
        `Portfolio ${organizationId}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  return result;
}
