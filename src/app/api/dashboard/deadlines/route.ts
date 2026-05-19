/** GET + POST: Dashboard deadlines */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getVisibleAssessmentSql } from "@/lib/auth/assessment-visibility";
import { verifyAssessmentAccess } from "@/lib/auth/verify-assessment-access";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

interface DeadlineRow {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date;
  status: string;
  assignedRole: string | null;
}

/** GET: List deadlines for the user's assessments */
export async function GET(): Promise<NextResponse> {
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

  const assessmentSqlFilter = getVisibleAssessmentSql(user);
  const deadlines = await prisma.$queryRaw<DeadlineRow[]>(Prisma.sql`
    SELECT d.id, d.title, d.description, d."dueDate", d.status, d."assignedRole"
    FROM "DashboardDeadline" d
    JOIN "Assessment" a ON a.id = d."assessmentId"
    WHERE a."deletedAt" IS NULL
    ${assessmentSqlFilter}
    ORDER BY d."dueDate" ASC
    LIMIT 50
  `);

  return NextResponse.json({ data: deadlines });
}

const createSchema = z.object({
  assessmentId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime(),
  assignedRole: z.string().optional(),
  assignedUser: z.string().optional(),
});

/** POST: Create a deadline */
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

  const body: unknown = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const hasAccess = await verifyAssessmentAccess(user, parsed.data.assessmentId);
  if (!hasAccess) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "You do not have access to this assessment" } },
      { status: 403 },
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
