/** POST: Create a deadline */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const createSchema = z.object({
  assessmentId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime(),
  assignedRole: z.string().optional(),
  assignedUser: z.string().optional(),
});
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const body: unknown = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const deadline = await prisma.dashboardDeadline.create({
    data: {
      assessmentId: parsed.data.assessmentId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      dueDate: new Date(parsed.data.dueDate),
      assignedRole: parsed.data.assignedRole ?? null,
      assignedUser: parsed.data.assignedUser ?? null,
      createdBy: user.email,
    },
  });

  await logDecision({
    assessmentId: parsed.data.assessmentId,
    entityType: "deadline",
    entityId: deadline.id,
    action: "DEADLINE_CREATED",
    newValue: { title: parsed.data.title, dueDate: parsed.data.dueDate },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: deadline }, { status: 201 });
}
