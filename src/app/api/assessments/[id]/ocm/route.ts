/** GET: List OCM impacts, POST: Create OCM impact */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getOcmImpacts } from "@/lib/db/registers";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/db/decision-log";
import { ERROR_CODES } from "@/types/api";
import type { DecisionAction, UserRole } from "@/types/assessment";

const CreateOcmSchema = z.object({
  impactedRole: z.string().min(1).max(200),
  impactedDepartment: z.string().max(200).optional(),
  functionalArea: z.string().max(200).optional(),
  changeType: z.enum(["PROCESS_CHANGE", "ROLE_CHANGE", "TECHNOLOGY_CHANGE", "ORGANIZATIONAL", "BEHAVIORAL"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "TRANSFORMATIONAL"]),
  description: z.string().min(1).max(5000),
  trainingRequired: z.boolean().default(false),
  trainingType: z.enum(["INSTRUCTOR_LED", "E_LEARNING", "ON_THE_JOB", "WORKSHOP"]).optional(),
  trainingDuration: z.number().min(0).max(365).optional(),
  communicationPlan: z.string().max(5000).optional(),
  resistanceRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  readinessScore: z.number().min(0).max(1).optional(),
  mitigationStrategy: z.string().max(5000).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  scopeItemId: z.string().optional(),
  technicalNotes: z.string().max(5000).optional(),
}).refine(
  (data) => !data.trainingRequired || data.trainingType !== undefined,
  { message: "Training type is required when training is marked as required", path: ["trainingType"] },
);

export const preferredRegion = "sin1";

export async function GET(
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

  const { id: assessmentId } = await params;
  const sp = request.nextUrl.searchParams;

  const result = await getOcmImpacts(assessmentId, {
    status: sp.get("status") ?? undefined,
    changeType: sp.get("changeType") ?? undefined,
    severity: sp.get("severity") ?? undefined,
    resistanceRisk: sp.get("resistanceRisk") ?? undefined,
    functionalArea: sp.get("functionalArea") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
  });

  return NextResponse.json(result);
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

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
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

  const body = await request.json();
  const parsed = CreateOcmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  const createData: Record<string, unknown> = {
    assessmentId,
    impactedRole: parsed.data.impactedRole,
    impactedDepartment: parsed.data.impactedDepartment ?? null,
    functionalArea: parsed.data.functionalArea ?? null,
    changeType: parsed.data.changeType,
    severity: parsed.data.severity,
    description: parsed.data.description,
    trainingRequired: parsed.data.trainingRequired,
    trainingType: parsed.data.trainingType ?? null,
    trainingDuration: parsed.data.trainingDuration ?? null,
    communicationPlan: parsed.data.communicationPlan ?? null,
    resistanceRisk: parsed.data.resistanceRisk ?? null,
    readinessScore: parsed.data.readinessScore ?? null,
    mitigationStrategy: parsed.data.mitigationStrategy ?? null,
    priority: parsed.data.priority ?? null,
    scopeItemId: parsed.data.scopeItemId ?? null,
    technicalNotes: parsed.data.technicalNotes ?? null,
    createdBy: user.id,
  };

  const created = await prisma.ocmImpact.create({
    data: createData as Parameters<typeof prisma.ocmImpact.create>[0]["data"],
  });

  await logDecision({
    assessmentId,
    entityType: "ocm_impact",
    entityId: created.id,
    action: "OCM_CREATED" as DecisionAction,
    newValue: JSON.parse(JSON.stringify(parsed.data)) as Record<string, string>,
    actor: user.id,
    actorRole: user.role as UserRole,
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
