/** PUT: Update a deadline */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";


const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime().optional(),
  assignedRole: z.string().optional(),
  assignedUser: z.string().optional(),
  status: z.enum(["pending", "at_risk", "overdue", "completed"]).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ deadlineId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { deadlineId } = await params;

  const existing = await prisma.dashboardDeadline.findUnique({
    where: { id: deadlineId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Deadline not found" } },
      { status: 404 },
    );
  }

  const body: unknown = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.dueDate !== undefined) updateData.dueDate = new Date(parsed.data.dueDate);
  if (parsed.data.assignedRole !== undefined) updateData.assignedRole = parsed.data.assignedRole;
  if (parsed.data.assignedUser !== undefined) updateData.assignedUser = parsed.data.assignedUser;
  if (parsed.data.status !== undefined) {
    updateData.status = parsed.data.status;
    if (parsed.data.status === "completed") {
      updateData.completedAt = new Date();
    }
  }

  const deadline = await prisma.dashboardDeadline.update({
    where: { id: deadlineId },
    data: updateData,
  });

  await logDecision({
    assessmentId: existing.assessmentId,
    entityType: "deadline",
    entityId: deadlineId,
    action: "DEADLINE_UPDATED",
    oldValue: { status: existing.status, title: existing.title },
    newValue: { status: deadline.status, title: deadline.title },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: deadline });
}
