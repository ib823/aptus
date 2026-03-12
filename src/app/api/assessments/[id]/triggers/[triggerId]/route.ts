/** PUT: Update trigger status */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const updateTriggerSchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "DISMISSED"]),
  resolution: z.string().optional(),
  changeRequestId: z.string().optional(),
});

const TRIGGER_UPDATE_ROLES: UserRole[] = [
  "platform_admin",
  "partner_lead",
  "consultant",
  "project_manager",
];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; triggerId: string }> },
): Promise<NextResponse> {
  const { id, triggerId } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const role = mapLegacyRole(user.role);
  if (!TRIGGER_UPDATE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to update triggers" } },
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

  const parsed = updateTriggerSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const trigger = await prisma.reassessmentTrigger.findFirst({
    where: { id: triggerId, assessmentId: id },
  });

  if (!trigger) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Trigger not found" } },
      { status: 404 },
    );
  }

  if (parsed.data.changeRequestId) {
    const changeRequest = await prisma.changeRequest.findFirst({
      where: { id: parsed.data.changeRequestId, assessmentId: id },
      select: { id: true },
    });
    if (!changeRequest) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.NOT_FOUND, message: "Change request not found" } },
        { status: 404 },
      );
    }
  }

  const isResolved = parsed.data.status === "RESOLVED" || parsed.data.status === "DISMISSED";

  const updated = await prisma.reassessmentTrigger.update({
    where: { id: triggerId },
    data: {
      status: parsed.data.status,
      resolution: parsed.data.resolution ?? null,
      changeRequestId: parsed.data.changeRequestId ?? null,
      resolvedAt: isResolved ? new Date() : null,
      resolvedById: isResolved ? user.id : null,
    },
  });

  return NextResponse.json({ data: updated });
}
