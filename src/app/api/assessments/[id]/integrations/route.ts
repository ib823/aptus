/** GET: List integration points, POST: Create integration point */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getIntegrationPoints } from "@/lib/db/registers";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/db/decision-log";
import { ERROR_CODES } from "@/types/api";
import type { DecisionAction, UserRole } from "@/types/assessment";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const CreateIntegrationSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  direction: z.enum(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]),
  sourceSystem: z.string().min(1).max(200),
  targetSystem: z.string().min(1).max(200),
  interfaceType: z.enum(["API", "IDOC", "FILE", "RFC", "ODATA", "EVENT"]),
  frequency: z.enum(["REAL_TIME", "NEAR_REAL_TIME", "BATCH_DAILY", "BATCH_WEEKLY", "ON_DEMAND"]),
  middleware: z.enum(["SAP_CPI", "SAP_PO", "MULESOFT", "BOOMI", "AZURE_INTEGRATION", "OTHER"]).optional(),
  dataVolume: z.string().max(200).optional(),
  complexity: z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  scopeItemId: z.string().optional(),
  technicalNotes: z.string().max(5000).optional(),
});

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

  const result = await getIntegrationPoints(assessmentId, {
    status: sp.get("status") ?? undefined,
    direction: sp.get("direction") ?? undefined,
    interfaceType: sp.get("interfaceType") ?? undefined,
    priority: sp.get("priority") ?? undefined,
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
  const parsed = CreateIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  const createData: Record<string, unknown> = {
    assessmentId,
    name: parsed.data.name,
    description: parsed.data.description,
    direction: parsed.data.direction,
    sourceSystem: parsed.data.sourceSystem,
    targetSystem: parsed.data.targetSystem,
    interfaceType: parsed.data.interfaceType,
    frequency: parsed.data.frequency,
    middleware: parsed.data.middleware ?? null,
    dataVolume: parsed.data.dataVolume ?? null,
    complexity: parsed.data.complexity ?? null,
    priority: parsed.data.priority ?? null,
    scopeItemId: parsed.data.scopeItemId ?? null,
    technicalNotes: parsed.data.technicalNotes ?? null,
    createdBy: user.id,
  };

  const created = await prisma.integrationPoint.create({
    data: createData as Parameters<typeof prisma.integrationPoint.create>[0]["data"],
  });

  await logDecision({
    assessmentId,
    entityType: "integration_point",
    entityId: created.id,
    action: "INTEGRATION_CREATED" as DecisionAction,
    newValue: JSON.parse(JSON.stringify(parsed.data)) as Record<string, string>,
    actor: user.id,
    actorRole: user.role as UserRole,
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
