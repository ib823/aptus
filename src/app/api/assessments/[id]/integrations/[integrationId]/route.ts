/** PUT: Update integration point, DELETE: Delete integration point */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/db/decision-log";
import { ERROR_CODES } from "@/types/api";
import type { DecisionAction, UserRole } from "@/types/assessment";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const UpdateIntegrationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  direction: z.enum(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]).optional(),
  sourceSystem: z.string().min(1).max(200).optional(),
  targetSystem: z.string().min(1).max(200).optional(),
  interfaceType: z.enum(["API", "IDOC", "FILE", "RFC", "ODATA", "EVENT"]).optional(),
  frequency: z.enum(["REAL_TIME", "NEAR_REAL_TIME", "BATCH_DAILY", "BATCH_WEEKLY", "ON_DEMAND"]).optional(),
  middleware: z.enum(["SAP_CPI", "SAP_PO", "MULESOFT", "BOOMI", "AZURE_INTEGRATION", "OTHER"]).nullable().optional(),
  dataVolume: z.string().max(200).nullable().optional(),
  complexity: z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]).nullable().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).nullable().optional(),
  status: z.enum(["identified", "analyzed", "designed", "approved"]).optional(),
  scopeItemId: z.string().nullable().optional(),
  technicalNotes: z.string().max(5000).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string; integrationId: string }> };

export async function PUT(
  request: NextRequest,
  { params }: RouteParams,
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

  const { id: assessmentId, integrationId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { status: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  if (assessment.status === "signed_off") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Assessment is locked after sign-off" } },
      { status: 403 },
    );
  }

  const existing = await prisma.integrationPoint.findUnique({
    where: { id: integrationId },
  });

  if (!existing || existing.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Integration point not found" } },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = UpdateIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  // Build update data, converting undefined to absent keys
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.direction !== undefined) updateData.direction = parsed.data.direction;
  if (parsed.data.sourceSystem !== undefined) updateData.sourceSystem = parsed.data.sourceSystem;
  if (parsed.data.targetSystem !== undefined) updateData.targetSystem = parsed.data.targetSystem;
  if (parsed.data.interfaceType !== undefined) updateData.interfaceType = parsed.data.interfaceType;
  if (parsed.data.frequency !== undefined) updateData.frequency = parsed.data.frequency;
  if (parsed.data.middleware !== undefined) updateData.middleware = parsed.data.middleware;
  if (parsed.data.dataVolume !== undefined) updateData.dataVolume = parsed.data.dataVolume;
  if (parsed.data.complexity !== undefined) updateData.complexity = parsed.data.complexity;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.scopeItemId !== undefined) updateData.scopeItemId = parsed.data.scopeItemId;
  if (parsed.data.technicalNotes !== undefined) updateData.technicalNotes = parsed.data.technicalNotes;

  const updated = await prisma.integrationPoint.update({
    where: { id: integrationId },
    data: updateData,
  });

  await logDecision({
    assessmentId,
    entityType: "integration_point",
    entityId: integrationId,
    action: "INTEGRATION_UPDATED" as DecisionAction,
    oldValue: JSON.parse(JSON.stringify(existing)) as Record<string, string>,
    newValue: JSON.parse(JSON.stringify(parsed.data)) as Record<string, string>,
    actor: user.id,
    actorRole: user.role as UserRole,
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams,
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

  const { id: assessmentId, integrationId } = await params;

  const existing = await prisma.integrationPoint.findUnique({
    where: { id: integrationId },
  });

  if (!existing || existing.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Integration point not found" } },
      { status: 404 },
    );
  }

  await prisma.integrationPoint.delete({ where: { id: integrationId } });

  await logDecision({
    assessmentId,
    entityType: "integration_point",
    entityId: integrationId,
    action: "INTEGRATION_DELETED" as DecisionAction,
    oldValue: JSON.parse(JSON.stringify(existing)) as Record<string, string>,
    newValue: { deleted: true },
    actor: user.id,
    actorRole: user.role as UserRole,
  });

  return NextResponse.json({ data: { deleted: true, id: integrationId } });
}
