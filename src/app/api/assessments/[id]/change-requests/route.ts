/** GET: List change requests */
/** POST: Create change request */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computeImpactSummary } from "@/lib/lifecycle/delta-engine";
import type { UnlockedEntity } from "@/types/lifecycle";
import type { SnapshotData } from "@/types/signoff";
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

export const preferredRegion = "sin1";

export async function GET(
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

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { id } = await params;
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

  const allowedRoles = ["platform_admin", "partner_lead", "consultant", "project_manager"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to create change requests" } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = createChangeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
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
