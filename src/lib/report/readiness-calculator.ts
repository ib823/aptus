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
  if (total === 0) return 100;
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
  const score = pct(done, total);
  const status = statusFromScore(score);
  const findings: string[] = [];
  const recommendations: string[] = [];

  if (total === 0) {
    findings.push(`No ${itemLabel} identified yet.`);
    recommendations.push(`Identify and catalog all ${itemLabel}.`);
  } else if (done < total) {
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

  const overallScore =
    categories.length > 0
      ? Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length)
      : 0;

  const overallStatus = statusFromScore(overallScore);

  const redCount = categories.filter((c) => c.status === "red").length;
  let goNoGo: GoNoGoDecision;
  if (redCount === 0) {
    goNoGo = "go";
  } else if (redCount <= 2) {
    goNoGo = "conditional_go";
  } else {
    goNoGo = "no_go";
  }

  const greenCount = categories.filter((c) => c.status === "green").length;
  const amberCount = categories.filter((c) => c.status === "amber").length;

  let executiveSummary: string;
  if (goNoGo === "go") {
    executiveSummary = `Assessment readiness is ${overallScore}%. All ${categories.length} categories are on track. Recommendation: GO.`;
  } else if (goNoGo === "conditional_go") {
    executiveSummary = `Assessment readiness is ${overallScore}%. ${greenCount} categories green, ${amberCount} amber, ${redCount} red. Recommendation: CONDITIONAL GO — address red areas before proceeding.`;
  } else {
    executiveSummary = `Assessment readiness is ${overallScore}%. ${redCount} categories are red. Recommendation: NO GO — significant remediation required.`;
  }

  return {
    overallScore,
    overallStatus,
    categories,
    goNoGo,
    executiveSummary,
  };
}
