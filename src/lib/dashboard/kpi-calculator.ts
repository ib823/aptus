/** Phase 23: KPI calculator — pure functions for computing dashboard metrics */

import type { KpiMetrics } from "@/types/dashboard";

interface StepData {
  fitStatus: string;
}

interface GapData {
  resolutionType: string;
}

interface IntegrationData {
  status: string;
}

interface MigrationData {
  status: string;
}

interface OcmImpact {
  impactScore: number;
}

/**
 * Calculate KPI metrics from pre-fetched assessment data.
 * All inputs are plain data — no DB calls.
 */
export function calculateKpiMetrics(
  steps: StepData[],
  gaps: GapData[],
  integrations: IntegrationData[],
  migrations: MigrationData[],
  ocmImpacts: OcmImpact[],
): KpiMetrics {
  const totalSteps = steps.length;
  let fitCount = 0;
  let configureCount = 0;
  let gapCount = 0;
  let naCount = 0;
  let pendingCount = 0;

  for (const step of steps) {
    switch (step.fitStatus) {
      case "FIT":
        fitCount++;
        break;
      case "CONFIGURE":
        configureCount++;
        break;
      case "GAP":
        gapCount++;
        break;
      case "NA":
        naCount++;
        break;
      default:
        pendingCount++;
    }
  }

  const completedSteps = fitCount + configureCount + gapCount + naCount;
  const completionPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const totalGaps = gaps.length;
  const resolvedGaps = gaps.filter(
    (g) => g.resolutionType !== "PENDING" && g.resolutionType !== "",
  ).length;
  const gapResolutionPercent = totalGaps > 0 ? Math.round((resolvedGaps / totalGaps) * 100) : 0;

  const totalIntegrations = integrations.length;
  const completedIntegrations = integrations.filter(
    (i) => i.status === "completed" || i.status === "COMPLETED",
  ).length;
  const integrationPercent =
    totalIntegrations > 0 ? Math.round((completedIntegrations / totalIntegrations) * 100) : 0;

  const totalMigrations = migrations.length;
  const completedMigrations = migrations.filter(
    (m) => m.status === "completed" || m.status === "COMPLETED",
  ).length;
  const migrationPercent =
    totalMigrations > 0 ? Math.round((completedMigrations / totalMigrations) * 100) : 0;

  const ocmAverageScore =
    ocmImpacts.length > 0
      ? Math.round(
          ocmImpacts.reduce((sum, o) => sum + o.impactScore, 0) / ocmImpacts.length,
        )
      : 0;
  const ocmHighImpactCount = ocmImpacts.filter((o) => o.impactScore >= 4).length;

  return {
    totalSteps,
    completedSteps,
    completionPercent,
    fitCount,
    configureCount,
    gapCount,
    naCount,
    pendingCount,
    totalGaps,
    resolvedGaps,
    gapResolutionPercent,
    totalIntegrations,
    completedIntegrations,
    integrationPercent,
    totalMigrations,
    completedMigrations,
    migrationPercent,
    ocmAverageScore,
    ocmHighImpactCount,
  };
}
