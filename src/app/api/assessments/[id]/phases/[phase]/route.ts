/** PUT: Update phase status/completionPct/blockedReason */

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
import { ASSESSMENT_PHASES } from "@/types/assessment";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const phaseUpdateSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed", "blocked"]).optional(),
  completionPct: z.number().int().min(0).max(100).optional(),
  blockedReason: z.string().max(2000).nullable().optional(),
});

const PHASE_UPDATE_ROLES: UserRole[] = ["platform_admin", "partner_lead", "consultant"];
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; phase: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, phase } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const role = mapLegacyRole(user.role);
  if (!PHASE_UPDATE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to update phase progress" } },
      { status: 403 },
    );
  }

  // Validate phase is one of the 8 valid phases
  if (!ASSESSMENT_PHASES.includes(phase as typeof ASSESSMENT_PHASES[number])) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Invalid phase: ${phase}. Must be one of: ${ASSESSMENT_PHASES.join(", ")}` } },
      { status: 400 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = phaseUpdateSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  // Find existing phase record
  const existing = await prisma.assessmentPhaseProgress.findUnique({
    where: { assessmentId_phase: { assessmentId, phase } },
  });

  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Phase progress record not found" } },
      { status: 404 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) {
    updateData.status = parsed.data.status;
    if (parsed.data.status === "in_progress" && !existing.startedAt) {
      updateData.startedAt = new Date();
    }
    if (parsed.data.status === "completed") {
      updateData.completedAt = new Date();
      updateData.completedBy = user.id;
      updateData.completionPct = 100;
    }
  }
  if (parsed.data.completionPct !== undefined) {
    updateData.completionPct = parsed.data.completionPct;
  }
  if (parsed.data.blockedReason !== undefined) {
    updateData.blockedReason = parsed.data.blockedReason;
  }

  const updated = await prisma.assessmentPhaseProgress.update({
    where: { assessmentId_phase: { assessmentId, phase } },
    data: updateData,
  });

  await logDecision({
    assessmentId,
    entityType: "phase_progress",
    entityId: existing.id,
    action: "PHASE_UPDATED",
    oldValue: { status: existing.status, completionPct: existing.completionPct },
    newValue: { status: updated.status, completionPct: updated.completionPct },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: updated });
}
