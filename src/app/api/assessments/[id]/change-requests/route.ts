/** GET: List change requests */
/** POST: Create change request */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computeImpactSummary } from "@/lib/lifecycle/delta-engine";
import type { UnlockedEntity } from "@/types/lifecycle";
import type { SnapshotData } from "@/types/signoff";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const unlockedEntitySchema = z.object({
  entityType: z.enum(["scope_selection", "step_response", "gap_resolution", "integration", "data_migration", "ocm"]),
  entityId: z.string().min(1),
  scopeItemId: z.string().optional(),
  functionalArea: z.string().optional(),
  reason: z.string().min(1),
});

const createChangeRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  reason: z.string().min(1, "Reason is required"),
  unlockedEntities: z.array(unlockedEntitySchema).min(1, "At least one entity must be unlocked"),
  previousSnapshotId: z.string().min(1),
  expeditedSignOff: z.boolean().optional(),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const changeRequests = await prisma.changeRequest.findMany({
    where: { assessmentId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: changeRequests });
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

  const allowedRoles = ["platform_admin", "partner_lead", "consultant", "project_manager"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to create change requests" } },
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

  const parsed = createChangeRequestSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Prevent concurrent change requests — only one active CR allowed per assessment
  const existingActiveCR = await prisma.changeRequest.findFirst({
    where: {
      assessmentId: id,
      status: { in: ["REQUESTED", "APPROVED", "IN_PROGRESS"] },
    },
    select: { id: true, status: true, title: true },
  });

  if (existingActiveCR) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `An active change request already exists: "${existingActiveCR.title}" (status: ${existingActiveCR.status}). Complete or cancel it before creating a new one.` } },
      { status: 409 },
    );
  }

  // Verify snapshot exists
  const snapshot = await prisma.assessmentSnapshot.findUnique({
    where: { id: parsed.data.previousSnapshotId },
  });
  if (!snapshot || snapshot.assessmentId !== id) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Previous snapshot not found" } },
      { status: 404 },
    );
  }

  const snapshotData = snapshot.snapshotData as unknown as SnapshotData;
  const unlockedEntities = parsed.data.unlockedEntities as UnlockedEntity[];
  const impactSummary = computeImpactSummary(unlockedEntities, snapshotData);

  const changeRequest = await prisma.changeRequest.create({
    data: {
      assessmentId: id,
      requestedById: user.id,
      title: parsed.data.title,
      reason: parsed.data.reason,
      impactSummary: impactSummary as object,
      unlockedEntities: unlockedEntities as object[],
      previousSnapshotId: parsed.data.previousSnapshotId,
      expeditedSignOff: parsed.data.expeditedSignOff ?? true,
    },
  });

  await logDecision({
    assessmentId: id,
    entityType: "change_request",
    entityId: changeRequest.id,
    action: "CHANGE_REQUEST_CREATED",
    newValue: {
      title: parsed.data.title,
      entitiesCount: unlockedEntities.length,
      riskLevel: impactSummary.riskLevel,
    },
    actor: user.email,
    actorRole: user.role,
    reason: parsed.data.reason,
  });

  return NextResponse.json({ data: changeRequest }, { status: 201 });
}
