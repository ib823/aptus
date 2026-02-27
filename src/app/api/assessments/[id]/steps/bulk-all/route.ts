/** POST: Bulk mark ALL unreviewed classifiable steps across ALL scope items as FIT */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";

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

  const { id: assessmentId } = await params;

  // Verify assessment exists and user has access
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, status: true, organizationId: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  if (assessment.status === "signed_off" || assessment.status === "reviewed") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Assessment is read-only" } },
      { status: 403 },
    );
  }

  // Find all selected scope items for this assessment
  const selectedScopes = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });

  const scopeItemIds = selectedScopes.map((s) => s.scopeItemId);

  if (scopeItemIds.length === 0) {
    return NextResponse.json({
      data: { marked: 0, scopeItems: 0, message: "No selected scope items" },
    });
  }

  // Find all existing step responses for this assessment
  const existingResponses = await prisma.stepResponse.findMany({
    where: { assessmentId },
    select: { processStepId: true, fitStatus: true },
  });

  const respondedStepIds = new Set<string>();
  for (const r of existingResponses) {
    if (r.fitStatus !== "PENDING") {
      respondedStepIds.add(r.processStepId);
    }
  }

  // Find all classifiable steps in selected scope items that don't have a response
  const unrespondedSteps = await prisma.processStep.findMany({
    where: {
      scopeItemId: { in: scopeItemIds },
      isClassifiable: true,
      id: { notIn: Array.from(respondedStepIds) },
    },
    select: { id: true, scopeItemId: true },
  });

  if (unrespondedSteps.length === 0) {
    return NextResponse.json({
      data: { marked: 0, scopeItems: scopeItemIds.length, message: "No pending steps to mark" },
    });
  }

  // Bulk create step responses as FIT
  const now = new Date();
  await prisma.stepResponse.createMany({
    data: unrespondedSteps.map((step) => ({
      assessmentId,
      processStepId: step.id,
      fitStatus: "FIT",
      respondent: user.email,
      respondedAt: now,
    })),
    skipDuplicates: true,
  });

  // Log to decision log
  await logDecision({
    assessmentId,
    entityType: "process_step",
    entityId: "bulk-all",
    action: "BULK_MARK_ALL_FIT",
    newValue: {
      stepCount: unrespondedSteps.length,
      scopeItemCount: scopeItemIds.length,
      message: `Marked ${unrespondedSteps.length} steps as FIT across ${scopeItemIds.length} scope items`,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({
    data: {
      marked: unrespondedSteps.length,
      scopeItems: scopeItemIds.length,
      message: `Marked ${unrespondedSteps.length} steps as FIT`,
    },
  });
}
