/** POST: Link two assessments as cross-phase (Phase 1 -> Phase 2) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computeScopeDelta, computeClassificationDelta } from "@/lib/analytics/scope-delta";
import { z } from "zod";

const linkAssessmentsSchema = z.object({
  phase1AssessmentId: z.string().min(1),
  phase2AssessmentId: z.string().min(1),
  clientIdentifier: z.string().min(1, "Client identifier is required"),
});
export async function POST(request: NextRequest): Promise<NextResponse> {
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
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = linkAssessmentsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  if (parsed.data.phase1AssessmentId === parsed.data.phase2AssessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Cannot link an assessment to itself" } },
      { status: 400 },
    );
  }

  // Load both assessments with their scope selections and step responses
  const [phase1, phase2] = await Promise.all([
    prisma.assessment.findUnique({
      where: { id: parsed.data.phase1AssessmentId },
      select: {
        id: true,
        organizationId: true,
        scopeSelections: { select: { scopeItemId: true, relevance: true } },
        stepResponses: { select: { processStepId: true, fitStatus: true } },
      },
    }),
    prisma.assessment.findUnique({
      where: { id: parsed.data.phase2AssessmentId },
      select: {
        id: true,
        organizationId: true,
        scopeSelections: { select: { scopeItemId: true, relevance: true } },
        stepResponses: { select: { processStepId: true, fitStatus: true } },
      },
    }),
  ]);

  if (!phase1 || !phase2) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "One or both assessments not found" } },
      { status: 404 },
    );
  }

  if (user.organizationId && (phase1.organizationId !== user.organizationId || phase2.organizationId !== user.organizationId)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Both assessments must belong to your organization" } },
      { status: 403 },
    );
  }

  // Compute deltas
  const scopeDelta = computeScopeDelta(phase1.scopeSelections, phase2.scopeSelections);
  const classificationDelta = computeClassificationDelta(phase1.stepResponses, phase2.stepResponses);

  // Check for existing link
  const existingLink = await prisma.assessmentPhaseLink.findUnique({
    where: {
      phase1AssessmentId_phase2AssessmentId: {
        phase1AssessmentId: parsed.data.phase1AssessmentId,
        phase2AssessmentId: parsed.data.phase2AssessmentId,
      },
    },
  });

  if (existingLink) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.CONFLICT, message: "These assessments are already linked" } },
      { status: 409 },
    );
  }

  const link = await prisma.assessmentPhaseLink.create({
    data: {
      clientIdentifier: parsed.data.clientIdentifier,
      phase1AssessmentId: parsed.data.phase1AssessmentId,
      phase2AssessmentId: parsed.data.phase2AssessmentId,
      linkedById: user.id,
      scopeDelta: scopeDelta as object,
      classificationDelta: classificationDelta as object,
    },
  });

  await logDecision({
    assessmentId: parsed.data.phase2AssessmentId,
    entityType: "phase_link",
    entityId: link.id,
    action: "CROSS_PHASE_LINKED",
    newValue: {
      phase1Id: parsed.data.phase1AssessmentId,
      phase2Id: parsed.data.phase2AssessmentId,
      clientIdentifier: parsed.data.clientIdentifier,
    },
    actor: user.email,
    actorRole: user.role,
    reason: `Linked phases for client ${parsed.data.clientIdentifier}`,
  });

  return NextResponse.json({ data: link }, { status: 201 });
}
