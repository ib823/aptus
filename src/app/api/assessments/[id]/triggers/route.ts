/** GET: List reassessment triggers */
/** POST: Create reassessment trigger */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const createTriggerSchema = z.object({
  triggerType: z.enum(["SAP_UPDATE", "REGULATORY_CHANGE", "ORG_CHANGE", "SCOPE_DRIFT", "MANUAL"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  sourceReference: z.string().optional(),
});

const TRIGGER_CREATE_ROLES: UserRole[] = [
  "platform_admin",
  "partner_lead",
  "consultant",
  "project_manager",
  "solution_architect",
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }

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
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const role = mapLegacyRole(user.role);
  if (!TRIGGER_CREATE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to create reassessment triggers" } },
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

  const parsed = createTriggerSchema.safeParse(bodyResult.data);
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
