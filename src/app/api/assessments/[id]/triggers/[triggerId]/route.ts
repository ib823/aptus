/** PUT: Update trigger status */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const updateTriggerSchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "DISMISSED"]),
  resolution: z.string().optional(),
  changeRequestId: z.string().optional(),
});
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; triggerId: string }> },
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
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to update triggers" } },
      { status: 403 },
    );
  }

  const { triggerId } = await params;
  const body: unknown = await request.json();
  const parsed = updateTriggerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const trigger = await prisma.reassessmentTrigger.findUnique({
    where: { id: triggerId },
  });

  if (!trigger) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Trigger not found" } },
      { status: 404 },
    );
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
