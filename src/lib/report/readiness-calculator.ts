/** Phase 25: Readiness Scorecard Calculator — pure function, no DB access */

import type {
  ReadinessScorecard,
  ReadinessScore,
  ReadinessStatus,
  GoNoGoDecision,
} from "@/types/report";

export interface ReadinessInput {
  totalScopeItems: number;
  decidedScopeItems: number;
  totalSteps: number;
  reviewedSteps: number;
  totalGaps: number;
  resolvedGaps: number;
  totalIntegrations: number;
  analyzedIntegrations: number;
  totalDmObjects: number;
  readyDmObjects: number;
  totalOcmImpacts: number;
  mitigatedOcmImpacts: number;
  totalStakeholders: number;
  activeStakeholders: number;
  totalSignOffs: number;
  completedSignOffs: number;
}

function pct(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

function statusFromScore(score: number): ReadinessStatus {
  if (score >= 80) return "green";
  if (score >= 50) return "amber";
  return "red";
}

function buildCategory(
  category: string,
  done: number,
  total: number,
  itemLabel: string,
): ReadinessScore {
  // N/A guard: when the category has no items to evaluate, render as N/A
  // rather than a vacuous 100% (the prior behaviour, which masked emptiness
  // as readiness).
  if (total === 0) {
    return {
      category,
      score: 0,
      status: "amber",
      notApplicable: true,
      findings: [`No ${itemLabel} identified — category not evaluated.`],
      recommendations: [],
    };
  }

  const score = pct(done, total);
  const status = statusFromScore(score);
  const findings: string[] = [];
  const recommendations: string[] = [];

  if (done < total) {
    const remaining = total - done;
    findings.push(`${remaining} of ${total} ${itemLabel} still pending.`);
    if (status === "red") {
      recommendations.push(`Prioritize completing remaining ${remaining} ${itemLabel} immediately.`);
    } else if (status === "amber") {
      recommendations.push(`Schedule effort to address remaining ${remaining} ${itemLabel}.`);
    }
  } else {
    findings.push(`All ${total} ${itemLabel} completed.`);
  }

  return { category, score, status, findings, recommendations };
}

export function calculateReadinessScorecard(data: ReadinessInput): ReadinessScorecard {
  const categories: ReadinessScore[] = [
    buildCategory("Scope Decisions", data.decidedScopeItems, data.totalScopeItems, "scope items"),
    buildCategory("Process Review", data.reviewedSteps, data.totalSteps, "process steps"),
    buildCategory("Gap Resolution", data.resolvedGaps, data.totalGaps, "gaps"),
    buildCategory("Integration Analysis", data.analyzedIntegrations, data.totalIntegrations, "integrations"),
    buildCategory("Data Migration Readiness", data.readyDmObjects, data.totalDmObjects, "data migration objects"),
    buildCategory("OCM Mitigation", data.mitigatedOcmImpacts, data.totalOcmImpacts, "OCM impacts"),
    buildCategory("Stakeholder Engagement", data.activeStakeholders, data.totalStakeholders, "stakeholders"),
    buildCategory("Sign-Off Progress", data.completedSignOffs, data.totalSignOffs, "sign-offs"),
  ];

  // N/A categories are excluded from the overall average + the red-count gate.
  // Without this, an assessment with no stakeholders + no DM/OCM analysis was
  // either falsely-100% (vacuous green) or counted toward the NO-GO threshold.
  const evaluated = categories.filter((c) => !c.notApplicable);
  const overallScore =
    evaluated.length > 0
      ? Math.round(evaluated.reduce((sum, c) => sum + c.score, 0) / evaluated.length)
      : 0;

  const overallStatus = statusFromScore(overallScore);

  const redCount = evaluated.filter((c) => c.status === "red").length;
  let goNoGo: GoNoGoDecision;
  if (redCount === 0) {
    goNoGo = "go";
  } else if (redCount <= 2) {
    goNoGo = "conditional_go";
  } else {
    goNoGo = "no_go";
  }

  const greenCount = evaluated.filter((c) => c.status === "green").length;
  const amberCount = evaluated.filter((c) => c.status === "amber").length;
  const naCount = categories.length - evaluated.length;
  const naSuffix = naCount > 0 ? ` (${naCount} not applicable)` : "";

  let executiveSummary: string;
  if (goNoGo === "go") {
    executiveSummary = `Assessment readiness is ${overallScore}%. All ${evaluated.length} evaluated categories are on track${naSuffix}. Recommendation: GO.`;
  } else if (goNoGo === "conditional_go") {
    executiveSummary = `Assessment readiness is ${overallScore}%. ${greenCount} categories green, ${amberCount} amber, ${redCount} red${naSuffix}. Recommendation: CONDITIONAL GO — address red areas before proceeding.`;
  } else {
    executiveSummary = `Assessment readiness is ${overallScore}%. ${redCount} categories are red${naSuffix}. Recommendation: NO GO — significant remediation required.`;
  }

  return {
    overallScore,
    overallStatus,
    categories,
    goNoGo,
    executiveSummary,
  };
}
