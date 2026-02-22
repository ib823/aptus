/** GET: List reassessment triggers */
/** POST: Create reassessment trigger */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const createTriggerSchema = z.object({
  triggerType: z.enum(["SAP_UPDATE", "REGULATORY_CHANGE", "ORG_CHANGE", "SCOPE_DRIFT", "MANUAL"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  sourceReference: z.string().optional(),
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
  const triggers = await prisma.reassessmentTrigger.findMany({
    where: { assessmentId: id },
    orderBy: { detectedAt: "desc" },
  });

  return NextResponse.json({ data: triggers });
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

  const allowedRoles = ["platform_admin", "partner_lead", "consultant", "project_manager", "solution_architect"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to create reassessment triggers" } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = createTriggerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const trigger = await prisma.reassessmentTrigger.create({
    data: {
      assessmentId: id,
      triggerType: parsed.data.triggerType,
      title: parsed.data.title,
      description: parsed.data.description,
      sourceReference: parsed.data.sourceReference ?? null,
      detectedById: user.id,
    },
  });

  await logDecision({
    assessmentId: id,
    entityType: "reassessment_trigger",
    entityId: trigger.id,
    action: "TRIGGER_CREATED",
    newValue: {
      triggerType: parsed.data.triggerType,
      title: parsed.data.title,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: trigger }, { status: 201 });
}
