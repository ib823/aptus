/** POST: Recalculate phase completion percentages from actual data */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { ASSESSMENT_PHASES } from "@/types/assessment";
import type { UserRole } from "@/types/assessment";

const RECALCULATE_ROLES: UserRole[] = ["platform_admin", "partner_lead", "consultant"];

/**
 * Calculate completion percentage for each phase based on actual data.
 * Returns a record mapping phase name to 0-100 integer.
 */
async function calculatePhaseCompletions(assessmentId: string): Promise<Record<string, number>> {
  // --- Scoping: selected scope items / total scope items ---
  const [totalScopeSelections, selectedScopeSelections] = await Promise.all([
    prisma.scopeSelection.count({ where: { assessmentId } }),
    prisma.scopeSelection.count({ where: { assessmentId, selected: true } }),
  ]);
  const scopingPct = totalScopeSelections > 0
    ? Math.round((selectedScopeSelections / totalScopeSelections) * 100)
    : 0;

  // --- Process Review: step responses with fitStatus != PENDING / total step responses ---
  const [totalStepResponses, classifiedStepResponses] = await Promise.all([
    prisma.stepResponse.count({ where: { assessmentId } }),
    prisma.stepResponse.count({ where: { assessmentId, fitStatus: { not: "PENDING" } } }),
  ]);
  const processReviewPct = totalStepResponses > 0
    ? Math.round((classifiedStepResponses / totalStepResponses) * 100)
    : 0;

  // --- Gap Resolution: client-approved gap resolutions / total gap resolutions ---
  const [totalGapResolutions, approvedGapResolutions] = await Promise.all([
    prisma.gapResolution.count({ where: { assessmentId } }),
    prisma.gapResolution.count({ where: { assessmentId, clientApproved: true } }),
  ]);
  const gapResolutionPct = totalGapResolutions > 0
    ? Math.round((approvedGapResolutions / totalGapResolutions) * 100)
    : 0;

  // --- Integration: approved integration points / total integration points ---
  const [totalIntegrationPoints, approvedIntegrationPoints] = await Promise.all([
    prisma.integrationPoint.count({ where: { assessmentId } }),
    prisma.integrationPoint.count({ where: { assessmentId, status: "approved" } }),
  ]);
  const integrationPct = totalIntegrationPoints > 0
    ? Math.round((approvedIntegrationPoints / totalIntegrationPoints) * 100)
    : 0;

  // --- Data Migration: approved data migration objects / total data migration objects ---
  const [totalDataMigrationObjects, approvedDataMigrationObjects] = await Promise.all([
    prisma.dataMigrationObject.count({ where: { assessmentId } }),
    prisma.dataMigrationObject.count({ where: { assessmentId, status: "approved" } }),
  ]);
  const dataMigrationPct = totalDataMigrationObjects > 0
    ? Math.round((approvedDataMigrationObjects / totalDataMigrationObjects) * 100)
    : 0;

  // --- OCM: approved OCM impacts / total OCM impacts ---
  const [totalOcmImpacts, approvedOcmImpacts] = await Promise.all([
    prisma.ocmImpact.count({ where: { assessmentId } }),
    prisma.ocmImpact.count({ where: { assessmentId, status: "approved" } }),
  ]);
  const ocmPct = totalOcmImpacts > 0
    ? Math.round((approvedOcmImpacts / totalOcmImpacts) * 100)
    : 0;

  // --- Validation: average of all above phases; 100 if average > 90, else the average ---
  const phaseAverages = [scopingPct, processReviewPct, gapResolutionPct, integrationPct, dataMigrationPct, ocmPct];
  const average = phaseAverages.reduce((sum, v) => sum + v, 0) / phaseAverages.length;
  const validationPct = average > 90 ? 100 : Math.round(average);

  // --- Sign-off: at least 1 sign-off needed ---
  const signOffCount = await prisma.assessmentSignOff.count({ where: { assessmentId } });
  const signOffPct = Math.min(Math.round((signOffCount / 1) * 100), 100);

  return {
    scoping: scopingPct,
    process_review: processReviewPct,
    gap_resolution: gapResolutionPct,
    integration: integrationPct,
    data_migration: dataMigrationPct,
    ocm: ocmPct,
    validation: validationPct,
    sign_off: signOffPct,
  };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const role = mapLegacyRole(user.role);
  if (!RECALCULATE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to recalculate phase progress" } },
      { status: 403 },
    );
  }

  // Calculate completion percentages from actual data
  const completions = await calculatePhaseCompletions(assessmentId);

  // Upsert each phase progress record
  const upsertResults = await Promise.all(
    ASSESSMENT_PHASES.map(async (phase) => {
      const completionPct = completions[phase] ?? 0;
      const status = completionPct === 0
        ? "not_started"
        : completionPct >= 100
          ? "completed"
          : "in_progress";

      const existing = await prisma.assessmentPhaseProgress.findUnique({
        where: { assessmentId_phase: { assessmentId, phase } },
        select: { id: true, completionPct: true, status: true },
      });

      const record = await prisma.assessmentPhaseProgress.upsert({
        where: { assessmentId_phase: { assessmentId, phase } },
        create: {
          assessmentId,
          phase,
          status,
          completionPct,
          startedAt: status !== "not_started" ? new Date() : null,
          completedAt: status === "completed" ? new Date() : null,
          completedBy: status === "completed" ? user.id : null,
        },
        update: {
          completionPct,
          status,
          ...(status === "completed" && !existing?.completionPct
            ? { completedAt: new Date(), completedBy: user.id }
            : {}),
          ...(status !== "not_started" ? { startedAt: new Date() } : {}),
        },
      });

      // Log the recalculation
      if (existing && (existing.completionPct !== completionPct || existing.status !== status)) {
        await logDecision({
          assessmentId,
          entityType: "phase_progress",
          entityId: record.id,
          action: "PHASE_UPDATED",
          oldValue: { status: existing.status, completionPct: existing.completionPct },
          newValue: { status, completionPct },
          actor: user.email,
          actorRole: user.role,
          reason: "Automated recalculation from actual data",
        });
      }

      return record;
    }),
  );

  return NextResponse.json({ data: upsertResults });
}
