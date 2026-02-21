/** Phase 26: Portfolio analytics computation engine */

/**
 * Compute a summary of a portfolio of assessments.
 */
export function computePortfolioSummary(
  assessments: Array<{
    status: string;
    stepResponses: Array<{ fitStatus: string }>;
    createdAt: Date;
    completedAt?: Date | null | undefined;
  }>,
): {
  totalAssessments: number;
  activeAssessments: number;
  completedAssessments: number;
  avgFitRate: number;
  avgAssessmentDurationDays: number;
} {
  const totalAssessments = assessments.length;
  if (totalAssessments === 0) {
    return {
      totalAssessments: 0,
      activeAssessments: 0,
      completedAssessments: 0,
      avgFitRate: 0,
      avgAssessmentDurationDays: 0,
    };
  }

  const completedStatuses = ["completed", "reviewed", "signed_off", "validated", "handed_off", "archived"];
  const activeStatuses = ["draft", "scoping", "in_progress", "workshop_active", "review_cycle", "gap_resolution", "pending_validation", "pending_sign_off"];

  const activeAssessments = assessments.filter((a) =>
    activeStatuses.includes(a.status),
  ).length;

  const completedAssessments = assessments.filter((a) =>
    completedStatuses.includes(a.status),
  ).length;

  // Compute average FIT rate across all assessments with responses
  const assessmentsWithResponses = assessments.filter(
    (a) => a.stepResponses.length > 0,
  );
  let avgFitRate = 0;
  if (assessmentsWithResponses.length > 0) {
    const fitRates = assessmentsWithResponses.map((a) => {
      const fitCount = a.stepResponses.filter(
        (r) => r.fitStatus.toUpperCase() === "FIT",
      ).length;
      return (fitCount / a.stepResponses.length) * 100;
    });
    avgFitRate =
      fitRates.reduce((sum, rate) => sum + rate, 0) / fitRates.length;
  }

  // Compute average assessment duration in days
  const completedWithDates = assessments.filter(
    (a) => a.completedAt != null,
  );
  let avgAssessmentDurationDays = 0;
  if (completedWithDates.length > 0) {
    const durations = completedWithDates.map((a) => {
      const start = a.createdAt.getTime();
      const end = (a.completedAt as Date).getTime();
      return (end - start) / (1000 * 60 * 60 * 24);
    });
    avgAssessmentDurationDays =
      durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  return {
    totalAssessments,
    activeAssessments,
    completedAssessments,
    avgFitRate: Math.round(avgFitRate * 100) / 100,
    avgAssessmentDurationDays:
      Math.round(avgAssessmentDurationDays * 100) / 100,
  };
}

/**
 * Compute average FIT rate grouped by industry.
 */
export function computeFitRateByIndustry(
  assessments: Array<{
    industry: string;
    stepResponses: Array<{ fitStatus: string }>;
  }>,
): Array<{ industry: string; avgFitRate: number; assessmentCount: number }> {
  const industryMap = new Map<
    string,
    { fitRates: number[]; count: number }
  >();

  for (const assessment of assessments) {
    if (assessment.stepResponses.length === 0) continue;

    const fitCount = assessment.stepResponses.filter(
      (r) => r.fitStatus.toUpperCase() === "FIT",
    ).length;
    const fitRate = (fitCount / assessment.stepResponses.length) * 100;

    const existing = industryMap.get(assessment.industry);
    if (existing) {
      existing.fitRates.push(fitRate);
      existing.count++;
    } else {
      industryMap.set(assessment.industry, {
        fitRates: [fitRate],
        count: 1,
      });
    }
  }

  return Array.from(industryMap.entries())
    .map(([industry, data]) => ({
      industry,
      avgFitRate:
        Math.round(
          (data.fitRates.reduce((s, r) => s + r, 0) / data.fitRates.length) *
            100,
        ) / 100,
      assessmentCount: data.count,
    }))
    .sort((a, b) => b.assessmentCount - a.assessmentCount);
}

/**
 * Compute the top gaps aggregated across assessments.
 */
export function computeTopGaps(
  gaps: Array<{ gapDescription: string; resolutionType: string }>,
): Array<{ description: string; frequency: number; resolutionType: string }> {
  if (gaps.length === 0) return [];

  const gapMap = new Map<
    string,
    { description: string; frequency: number; resolutionType: string }
  >();

  for (const gap of gaps) {
    // Use truncated description as a key for aggregation
    const key = gap.gapDescription.substring(0, 100).toLowerCase();
    const existing = gapMap.get(key);
    if (existing) {
      existing.frequency++;
    } else {
      gapMap.set(key, {
        description:
          gap.gapDescription.length > 100
            ? gap.gapDescription.substring(0, 100)
            : gap.gapDescription,
        frequency: 1,
        resolutionType: gap.resolutionType,
      });
    }
  }

  return Array.from(gapMap.values()).sort(
    (a, b) => b.frequency - a.frequency,
  );
}
