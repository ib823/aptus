/** POST: Clone assessment from a snapshot */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { DEFAULT_CARRY_FORWARD_CONFIG } from "@/types/lifecycle";
import type { SnapshotData } from "@/types/signoff";
import { z } from "zod";

const cloneSchema = z.object({
  snapshotVersion: z.number().int().min(1),
  reason: z.string().min(1, "Reason is required"),
  newCompanyName: z.string().optional(),
  carryForwardConfig: z.object({
    includeScope: z.boolean(),
    includeStepResponses: z.boolean(),
    includeGapResolutions: z.boolean(),
    includeIntegrations: z.boolean(),
    includeDataMigration: z.boolean(),
    includeOcm: z.boolean(),
    includeStakeholders: z.boolean(),
    resetStatus: z.boolean(),
  }).optional(),
});
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const allowedRoles = ["platform_admin", "partner_lead", "consultant"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to clone assessments" } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = cloneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Get source assessment
  const sourceAssessment = await prisma.assessment.findUnique({
    where: { id },
  });
  if (!sourceAssessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Source assessment not found" } },
      { status: 404 },
    );
  }

  // Source assessment must be in a terminal/completed status to clone
  const allowedCloneStatuses = ["signed_off", "handed_off", "completed", "archived"];
  if (!allowedCloneStatuses.includes(sourceAssessment.status)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Assessment must be signed off before cloning. Current status: "${sourceAssessment.status}".` } },
      { status: 400 },
    );
  }

  // Get snapshot
  const snapshot = await prisma.assessmentSnapshot.findUnique({
    where: {
      assessmentId_version: {
        assessmentId: id,
        version: parsed.data.snapshotVersion,
      },
    },
  });
  if (!snapshot) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Snapshot version not found" } },
      { status: 404 },
    );
  }

  const config = parsed.data.carryForwardConfig ?? DEFAULT_CARRY_FORWARD_CONFIG;
  const snapshotData = snapshot.snapshotData as unknown as SnapshotData;

  // Compute next phase number
  const maxPhase = await prisma.assessment.aggregate({
    where: {
      OR: [
        { id },
        { parentAssessmentId: id },
      ],
    },
    _max: { phaseNumber: true },
  });
  const nextPhaseNumber = (maxPhase._max.phaseNumber ?? 1) + 1;

  // Create cloned assessment
  const cloned = await prisma.assessment.create({
    data: {
      companyName: parsed.data.newCompanyName ?? sourceAssessment.companyName,
      industry: sourceAssessment.industry,
      country: sourceAssessment.country,
      operatingCountries: sourceAssessment.operatingCountries,
      companySize: sourceAssessment.companySize,
      revenueBand: sourceAssessment.revenueBand,
      currentErp: sourceAssessment.currentErp,
      sapVersion: sourceAssessment.sapVersion,
      status: config.resetStatus ? "draft" : sourceAssessment.status,
      createdBy: user.id,
      organizationId: sourceAssessment.organizationId,
      parentAssessmentId: id,
      phaseNumber: nextPhaseNumber,
      clonedFromSnapshotId: snapshot.id,
      carryForwardConfig: config as object,
      employeeCount: sourceAssessment.employeeCount,
      annualRevenue: sourceAssessment.annualRevenue,
      currencyCode: sourceAssessment.currencyCode,
      deploymentModel: sourceAssessment.deploymentModel,
      sapModules: sourceAssessment.sapModules,
      keyProcesses: sourceAssessment.keyProcesses,
      languageRequirements: sourceAssessment.languageRequirements,
      regulatoryFrameworks: sourceAssessment.regulatoryFrameworks,
      itLandscapeSummary: sourceAssessment.itLandscapeSummary,
      currentErpVersion: sourceAssessment.currentErpVersion,
      migrationApproach: sourceAssessment.migrationApproach,
    },
  });

  // Clone scope selections if configured
  if (config.includeScope && snapshotData.scopeSelections) {
    await prisma.scopeSelection.createMany({
      data: snapshotData.scopeSelections.map(s => ({
        assessmentId: cloned.id,
        scopeItemId: s.scopeItemId,
        selected: s.selected,
        relevance: s.relevance,
        notes: s.notes,
      })),
    });
  }

  // Clone step responses if configured
  if (config.includeStepResponses && snapshotData.stepResponses) {
    await prisma.stepResponse.createMany({
      data: snapshotData.stepResponses.map(s => ({
        assessmentId: cloned.id,
        processStepId: s.processStepId,
        fitStatus: s.fitStatus,
        clientNote: s.clientNote,
        confidence: s.confidence,
      })),
    });
  }

  // Clone gap resolutions if configured
  if (config.includeGapResolutions && snapshotData.gapResolutions) {
    await prisma.gapResolution.createMany({
      data: snapshotData.gapResolutions.map(g => ({
        assessmentId: cloned.id,
        processStepId: g.processStepId,
        scopeItemId: g.scopeItemId,
        gapDescription: g.resolutionDescription,
        resolutionType: g.resolutionType,
        resolutionDescription: g.resolutionDescription,
        priority: g.priority,
        riskCategory: g.riskCategory,
        clientApproved: g.clientApproved,
      })),
    });
  }

  // Clone integration points if configured
  if (config.includeIntegrations && snapshotData.integrationPoints) {
    await prisma.integrationPoint.createMany({
      data: snapshotData.integrationPoints.map(i => ({
        assessmentId: cloned.id,
        name: i.name,
        description: i.name,
        direction: i.direction,
        sourceSystem: i.sourceSystem,
        targetSystem: i.targetSystem,
        interfaceType: i.interfaceType,
        frequency: "ON_DEMAND",
        status: config.resetStatus ? "identified" : i.status,
        createdBy: user.id,
      })),
    });
  }

  // Clone data migration objects if configured
  if (config.includeDataMigration && snapshotData.dataMigrationObjects) {
    await prisma.dataMigrationObject.createMany({
      data: snapshotData.dataMigrationObjects.map(d => ({
        assessmentId: cloned.id,
        objectName: d.objectName,
        description: d.objectName,
        objectType: d.objectType,
        sourceSystem: d.sourceSystem,
        status: config.resetStatus ? "identified" : d.status,
        createdBy: user.id,
      })),
    });
  }

  // Clone stakeholders if configured
  if (config.includeStakeholders) {
    const stakeholders = await prisma.assessmentStakeholder.findMany({
      where: { assessmentId: id },
    });
    if (stakeholders.length > 0) {
      await prisma.assessmentStakeholder.createMany({
        data: stakeholders.map(s => ({
          assessmentId: cloned.id,
          userId: s.userId,
          name: s.name,
          email: s.email,
          role: s.role,
          invitedBy: user.id,
        })),
      });
    }
  }

  await logDecision({
    assessmentId: id,
    entityType: "assessment",
    entityId: cloned.id,
    action: "ASSESSMENT_CLONED",
    newValue: {
      clonedId: cloned.id,
      snapshotVersion: parsed.data.snapshotVersion,
      phaseNumber: nextPhaseNumber,
    },
    actor: user.email,
    actorRole: user.role,
    reason: parsed.data.reason,
  });

  return NextResponse.json({ data: cloned }, { status: 201 });
}
