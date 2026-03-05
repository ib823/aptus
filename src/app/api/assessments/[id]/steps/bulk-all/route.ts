/** POST: Bulk mark ALL unreviewed classifiable steps across ALL scope items as FIT */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";

export async function POST(
  _request: NextRequest,
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

  // Steps with no response yet -> create new FIT rows
  const createCandidates = await prisma.processStep.findMany({
    where: {
      scopeItemId: { in: scopeItemIds },
      isClassifiable: true,
      stepResponses: {
        none: { assessmentId },
      },
    },
    select: { id: true },
  });

  // Existing PENDING responses -> update to FIT
  const pendingResponses = await prisma.stepResponse.findMany({
    where: {
      assessmentId,
      fitStatus: "PENDING",
      processStep: {
        scopeItemId: { in: scopeItemIds },
        isClassifiable: true,
      },
    },
    select: { id: true },
  });

  if (createCandidates.length === 0 && pendingResponses.length === 0) {
    return NextResponse.json({
      data: { marked: 0, scopeItems: scopeItemIds.length, message: "No pending steps to mark" },
    });
  }

  const now = new Date();
  const batchSize = 250;
  let created = 0;
  let updated = 0;

  for (let i = 0; i < createCandidates.length; i += batchSize) {
    const chunk = createCandidates.slice(i, i + batchSize);
    const res = await prisma.stepResponse.createMany({
      data: chunk.map((step) => ({
        assessmentId,
        processStepId: step.id,
        fitStatus: "FIT",
        respondent: user.email,
        respondedAt: now,
      })),
      skipDuplicates: true,
    });
    created += res.count;
  }

  for (let i = 0; i < pendingResponses.length; i += batchSize) {
    const chunk = pendingResponses.slice(i, i + batchSize).map((r) => r.id);
    const res = await prisma.stepResponse.updateMany({
      where: {
        assessmentId,
        id: { in: chunk },
        fitStatus: "PENDING",
      },
      data: {
        fitStatus: "FIT",
        respondent: user.email,
        respondedAt: now,
      },
    });
    updated += res.count;
  }

  const marked = created + updated;

  // Log to decision log
  await logDecision({
    assessmentId,
    entityType: "process_step",
    entityId: "bulk-all",
    action: "BULK_MARK_ALL_FIT",
    newValue: {
      stepCount: marked,
      scopeItemCount: scopeItemIds.length,
      message: `Marked ${marked} steps as FIT across ${scopeItemIds.length} scope items`,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({
    data: {
      marked,
      created,
      updated,
      scopeItems: scopeItemIds.length,
      message: `Marked ${marked} steps as FIT`,
    },
  });
}
