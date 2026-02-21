/** Phase 10: Profile completeness scoring engine — pure function */

import type { ProfileCompletenessBreakdown } from "@/types/assessment";

interface AssessmentProfileFields {
  companyName?: string | null;
  industry?: string | null;
  country?: string | null;
  companySize?: string | null;
  employeeCount?: number | null;
  annualRevenue?: number | null;
  deploymentModel?: string | null;
  sapModules?: string[] | null;
  migrationApproach?: string | null;
  targetGoLiveDate?: Date | string | null;
  keyProcesses?: string[] | null;
  operatingCountries?: string[] | null;
  currentErpVersion?: string | null;
  itLandscapeSummary?: string | null;
}

interface ProfileCompletenessResult {
  score: number;
  breakdown: ProfileCompletenessBreakdown;
}

// Weighted groups (total = 100%)
const WEIGHTS = {
  basic: 30,       // companyName, industry, country, companySize
  financial: 15,   // employeeCount, annualRevenue
  sapStrategy: 30, // deploymentModel, sapModules, migrationApproach, targetGoLiveDate
  operational: 15, // keyProcesses, operatingCountries
  itLandscape: 10, // currentErpVersion, itLandscapeSummary
} as const;

function hasValue(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

function groupComplete(fields: unknown[]): boolean {
  return fields.every(hasValue);
}

/**
 * Calculate profile completeness score (0-100) with section breakdown.
 * Pure function — no DB access.
 */
export function calculateProfileCompleteness(
  assessment: AssessmentProfileFields,
): ProfileCompletenessResult {
  const basicFields = [
    assessment.companyName,
    assessment.industry,
    assessment.country,
    assessment.companySize,
  ];
  const financialFields = [assessment.employeeCount, assessment.annualRevenue];
  const sapStrategyFields = [
    assessment.deploymentModel,
    assessment.sapModules,
    assessment.migrationApproach,
    assessment.targetGoLiveDate,
  ];
  const operationalFields = [assessment.keyProcesses, assessment.operatingCountries];
  const itLandscapeFields = [assessment.currentErpVersion, assessment.itLandscapeSummary];

  const breakdown: ProfileCompletenessBreakdown = {
    basic: groupComplete(basicFields),
    financial: groupComplete(financialFields),
    sapStrategy: groupComplete(sapStrategyFields),
    operational: groupComplete(operationalFields),
    itLandscape: groupComplete(itLandscapeFields),
  };

  // Calculate weighted score — partial credit per group based on individual field completion
  let score = 0;

  const addGroupScore = (fields: unknown[], weight: number) => {
    const filled = fields.filter(hasValue).length;
    score += (filled / fields.length) * weight;
  };

  addGroupScore(basicFields, WEIGHTS.basic);
  addGroupScore(financialFields, WEIGHTS.financial);
  addGroupScore(sapStrategyFields, WEIGHTS.sapStrategy);
  addGroupScore(operationalFields, WEIGHTS.operational);
  addGroupScore(itLandscapeFields, WEIGHTS.itLandscape);

  return {
    score: Math.round(score),
    breakdown,
  };
}
