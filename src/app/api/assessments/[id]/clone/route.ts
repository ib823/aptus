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
