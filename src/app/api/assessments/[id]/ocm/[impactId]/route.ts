/** PUT: Update OCM impact, DELETE: Delete OCM impact */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/db/decision-log";
import { ERROR_CODES } from "@/types/api";
import type { DecisionAction, UserRole } from "@/types/assessment";

const UpdateOcmSchema = z.object({
  impactedRole: z.string().min(1).max(200).optional(),
  impactedDepartment: z.string().max(200).nullable().optional(),
  functionalArea: z.string().max(200).nullable().optional(),
  changeType: z.enum(["PROCESS_CHANGE", "ROLE_CHANGE", "TECHNOLOGY_CHANGE", "ORGANIZATIONAL", "BEHAVIORAL"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "TRANSFORMATIONAL"]).optional(),
  description: z.string().min(1).max(5000).optional(),
  trainingRequired: z.boolean().optional(),
  trainingType: z.enum(["INSTRUCTOR_LED", "E_LEARNING", "ON_THE_JOB", "WORKSHOP"]).nullable().optional(),
  trainingDuration: z.number().min(0).max(365).nullable().optional(),
  communicationPlan: z.string().max(5000).nullable().optional(),
  resistanceRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  readinessScore: z.number().min(0).max(1).nullable().optional(),
  mitigationStrategy: z.string().max(5000).nullable().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).nullable().optional(),
  status: z.enum(["identified", "assessed", "planned", "approved"]).optional(),
  scopeItemId: z.string().nullable().optional(),
  technicalNotes: z.string().max(5000).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string; impactId: string }> };
export async function PUT(
  request: NextRequest,
  { params }: RouteParams,
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

  const { id: assessmentId, impactId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { status: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  if (assessment.status === "signed_off") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Assessment is locked after sign-off" } },
      { status: 403 },
    );
  }

  const existing = await prisma.ocmImpact.findUnique({
    where: { id: impactId },
  });

  if (!existing || existing.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "OCM impact not found" } },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = UpdateOcmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  // Validate training consistency: if trainingRequired is being set to true, trainingType must be present
  const effectiveTrainingRequired = parsed.data.trainingRequired ?? existing.trainingRequired;
  const effectiveTrainingType = parsed.data.trainingType !== undefined ? parsed.data.trainingType : existing.trainingType;
  if (effectiveTrainingRequired && !effectiveTrainingType) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Training type is required when training is marked as required" } },
      { status: 400 },
    );
  }

  // Build update data, converting undefined to absent keys
  const updateData: Record<string, unknown> = {};
  if (parsed.data.impactedRole !== undefined) updateData.impactedRole = parsed.data.impactedRole;
  if (parsed.data.impactedDepartment !== undefined) updateData.impactedDepartment = parsed.data.impactedDepartment;
  if (parsed.data.functionalArea !== undefined) updateData.functionalArea = parsed.data.functionalArea;
  if (parsed.data.changeType !== undefined) updateData.changeType = parsed.data.changeType;
  if (parsed.data.severity !== undefined) updateData.severity = parsed.data.severity;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.trainingRequired !== undefined) updateData.trainingRequired = parsed.data.trainingRequired;
  if (parsed.data.trainingType !== undefined) updateData.trainingType = parsed.data.trainingType;
  if (parsed.data.trainingDuration !== undefined) updateData.trainingDuration = parsed.data.trainingDuration;
  if (parsed.data.communicationPlan !== undefined) updateData.communicationPlan = parsed.data.communicationPlan;
  if (parsed.data.resistanceRisk !== undefined) updateData.resistanceRisk = parsed.data.resistanceRisk;
  if (parsed.data.readinessScore !== undefined) updateData.readinessScore = parsed.data.readinessScore;
  if (parsed.data.mitigationStrategy !== undefined) updateData.mitigationStrategy = parsed.data.mitigationStrategy;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.scopeItemId !== undefined) updateData.scopeItemId = parsed.data.scopeItemId;
  if (parsed.data.technicalNotes !== undefined) updateData.technicalNotes = parsed.data.technicalNotes;

  const updated = await prisma.ocmImpact.update({
    where: { id: impactId },
    data: updateData,
  });

  await logDecision({
    assessmentId,
    entityType: "ocm_impact",
    entityId: impactId,
    action: "OCM_UPDATED" as DecisionAction,
    oldValue: JSON.parse(JSON.stringify(existing)) as Record<string, string>,
    newValue: JSON.parse(JSON.stringify(parsed.data)) as Record<string, string>,
    actor: user.id,
    actorRole: user.role as UserRole,
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams,
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

  const { id: assessmentId, impactId } = await params;

  const existing = await prisma.ocmImpact.findUnique({
    where: { id: impactId },
  });

  if (!existing || existing.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "OCM impact not found" } },
      { status: 404 },
    );
  }

  await prisma.ocmImpact.delete({ where: { id: impactId } });

  await logDecision({
    assessmentId,
    entityType: "ocm_impact",
    entityId: impactId,
    action: "OCM_DELETED" as DecisionAction,
    oldValue: JSON.parse(JSON.stringify(existing)) as Record<string, string>,
    newValue: { deleted: true },
    actor: user.id,
    actorRole: user.role as UserRole,
  });

  return NextResponse.json({ data: { deleted: true, id: impactId } });
}
