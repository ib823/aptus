/** GET: List workshop sessions for assessment */
/** POST: Create workshop session */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { logDecision } from "@/lib/audit/decision-logger";
import { generateSessionCode } from "@/lib/assessment/session-code";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const createWorkshopSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scheduledAt: z.string().datetime().optional(),
});

const WORKSHOP_CREATE_ROLES: UserRole[] = [
  "platform_admin", "consultant", "partner_lead", "solution_architect",
];
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

  const { id: assessmentId } = await params;

  const workshops = await prisma.workshopSession.findMany({
    where: { assessmentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sessionCode: true,
      title: true,
      description: true,
      status: true,
      facilitatorId: true,
      facilitatorName: true,
      scheduledAt: true,
      startedAt: true,
      completedAt: true,
      attendeeCount: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: workshops });
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

  const role = mapLegacyRole(user.role);
  if (!WORKSHOP_CREATE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to create workshop sessions" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;

  const body: unknown = await request.json();
  const parsed = createWorkshopSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  // Generate unique session code with retry
  let sessionCode = generateSessionCode();
  let retries = 0;
  while (retries < 5) {
    const exists = await prisma.workshopSession.findUnique({
      where: { sessionCode },
      select: { id: true },
    });
    if (!exists) break;
    sessionCode = generateSessionCode();
    retries++;
  }

  const workshop = await prisma.workshopSession.create({
    data: {
      assessmentId,
      sessionCode,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      facilitatorId: user.id,
      facilitatorName: user.name,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
    },
  });

  await logDecision({
    assessmentId,
    entityType: "workshop_session",
    entityId: workshop.id,
    action: "WORKSHOP_CREATED",
    newValue: { title: workshop.title, sessionCode: workshop.sessionCode },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: workshop }, { status: 201 });
}
