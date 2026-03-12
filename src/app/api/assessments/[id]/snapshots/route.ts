/** GET: List snapshots for an assessment */
/** POST: Create a new snapshot */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { computeCanonicalHash } from "@/lib/signoff/hash-engine";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const createSnapshotSchema = z.object({
  label: z.string().optional(),
  reason: z.string().min(1, "Reason is required"),
});

const SNAPSHOT_CREATE_ROLES: UserRole[] = ["platform_admin", "partner_lead", "consultant"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const snapshots = await prisma.assessmentSnapshot.findMany({
    where: { assessmentId: id },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      label: true,
      dataHash: true,
      createdById: true,
      reason: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: snapshots });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const role = mapLegacyRole(user.role);
  if (!SNAPSHOT_CREATE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to create snapshots" } },
      { status: 403 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = createSnapshotSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: {
      scopeSelections: {
        select: { id: true, scopeItemId: true, selected: true, relevance: true, notes: true },
      },
      stepResponses: {
        select: { id: true, processStepId: true, fitStatus: true, clientNote: true, confidence: true },
      },
      gapResolutions: {
        select: {
          id: true, processStepId: true, scopeItemId: true, resolutionType: true,
          resolutionDescription: true, priority: true, riskCategory: true, clientApproved: true,
        },
      },
      integrationPoints: {
        select: { id: true, name: true, direction: true, sourceSystem: true, targetSystem: true, interfaceType: true, status: true },
      },
      dataMigrationObjects: {
        select: { id: true, objectName: true, objectType: true, sourceSystem: true, status: true },
      },
    },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  // Compute next version
  const latestSnapshot = await prisma.assessmentSnapshot.findFirst({
    where: { assessmentId: id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestSnapshot?.version ?? 0) + 1;

  // Build snapshot data
  const snapshotData = {
    assessmentId: assessment.id,
    companyName: assessment.companyName,
    industry: assessment.industry,
    country: assessment.country,
    status: assessment.status,
    scopeSelections: assessment.scopeSelections,
    stepResponses: assessment.stepResponses,
    gapResolutions: assessment.gapResolutions,
    integrationPoints: assessment.integrationPoints,
    dataMigrationObjects: assessment.dataMigrationObjects,
    statistics: {
      totalScopeItems: assessment.scopeSelections.length,
      selectedScopeItems: assessment.scopeSelections.filter(s => s.selected).length,
      totalSteps: assessment.stepResponses.length,
      fitCount: assessment.stepResponses.filter(s => s.fitStatus === "FIT").length,
      configureCount: assessment.stepResponses.filter(s => s.fitStatus === "CONFIGURE").length,
      gapCount: assessment.stepResponses.filter(s => s.fitStatus === "GAP").length,
      naCount: assessment.stepResponses.filter(s => s.fitStatus === "NA").length,
      pendingCount: assessment.stepResponses.filter(s => s.fitStatus === "PENDING").length,
      totalGapResolutions: assessment.gapResolutions.length,
      approvedGapResolutions: assessment.gapResolutions.filter(g => g.clientApproved).length,
      integrationPointCount: assessment.integrationPoints.length,
      dataMigrationObjectCount: assessment.dataMigrationObjects.length,
    },
  };

  const dataHash = computeCanonicalHash(snapshotData);

  const snapshot = await prisma.assessmentSnapshot.create({
    data: {
      assessmentId: id,
      version: nextVersion,
      label: parsed.data.label ?? null,
      snapshotData: snapshotData as object,
      dataHash,
      createdById: user.id,
      reason: parsed.data.reason,
    },
  });

  await logDecision({
    assessmentId: id,
    entityType: "snapshot",
    entityId: snapshot.id,
    action: "SNAPSHOT_CREATED",
    newValue: { version: nextVersion, dataHash },
    actor: user.email,
    actorRole: user.role,
    reason: parsed.data.reason,
  });

  return NextResponse.json({ data: snapshot }, { status: 201 });
}
