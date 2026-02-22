/** GET: List data migration objects, POST: Create data migration object */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getDataMigrationObjects } from "@/lib/db/registers";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/db/decision-log";
import { ERROR_CODES } from "@/types/api";
import type { DecisionAction, UserRole } from "@/types/assessment";

const CreateDataMigrationSchema = z.object({
  objectName: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  objectType: z.enum(["MASTER_DATA", "TRANSACTION_DATA", "CONFIG_DATA", "HISTORICAL", "REFERENCE"]),
  sourceSystem: z.string().min(1).max(200),
  sourceFormat: z.enum(["SAP_TABLE", "CSV", "EXCEL", "XML", "DATABASE", "API"]).optional(),
  volumeEstimate: z.enum(["SMALL", "MEDIUM", "LARGE", "VERY_LARGE"]).optional(),
  recordCount: z.number().int().min(0).optional(),
  cleansingRequired: z.boolean().default(false),
  cleansingNotes: z.string().max(5000).optional(),
  mappingComplexity: z.enum(["SIMPLE", "MODERATE", "COMPLEX", "VERY_COMPLEX"]).optional(),
  migrationApproach: z.enum(["AUTOMATED", "SEMI_AUTOMATED", "MANUAL", "HYBRID"]).optional(),
  migrationTool: z.enum(["LTMC", "LSMW", "BODS", "CPI", "CUSTOM"]).optional(),
  validationRules: z.string().max(5000).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  dependsOn: z.array(z.string()).default([]),
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

  const result = await getDataMigrationObjects(assessmentId, {
    status: sp.get("status") ?? undefined,
    objectType: sp.get("objectType") ?? undefined,
    priority: sp.get("priority") ?? undefined,
    mappingComplexity: sp.get("mappingComplexity") ?? undefined,
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
  const parsed = CreateDataMigrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  // Circular dependency check if dependencies are specified
  if (parsed.data.dependsOn.length > 0) {
    const existingObjects = await prisma.dataMigrationObject.findMany({
      where: { assessmentId },
      select: { id: true, dependsOn: true },
    });

    // The new object doesn't have an ID yet, so we generate a placeholder
    // and check if any of its dependencies would create a cycle
    // Since it's a new node, it can't be part of an existing cycle,
    // but we validate that all referenced IDs exist in this assessment
    const existingIds = new Set(existingObjects.map((o) => o.id));
    for (const depId of parsed.data.dependsOn) {
      if (!existingIds.has(depId)) {
        return NextResponse.json(
          { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Dependency object ${depId} not found in this assessment` } },
          { status: 400 },
        );
      }
    }
  }

  const createData: Record<string, unknown> = {
    assessmentId,
    objectName: parsed.data.objectName,
    description: parsed.data.description,
    objectType: parsed.data.objectType,
    sourceSystem: parsed.data.sourceSystem,
    sourceFormat: parsed.data.sourceFormat ?? null,
    volumeEstimate: parsed.data.volumeEstimate ?? null,
    recordCount: parsed.data.recordCount ?? null,
    cleansingRequired: parsed.data.cleansingRequired,
    cleansingNotes: parsed.data.cleansingNotes ?? null,
    mappingComplexity: parsed.data.mappingComplexity ?? null,
    migrationApproach: parsed.data.migrationApproach ?? null,
    migrationTool: parsed.data.migrationTool ?? null,
    validationRules: parsed.data.validationRules ?? null,
    priority: parsed.data.priority ?? null,
    dependsOn: parsed.data.dependsOn,
    scopeItemId: parsed.data.scopeItemId ?? null,
    technicalNotes: parsed.data.technicalNotes ?? null,
    createdBy: user.id,
  };

  const created = await prisma.dataMigrationObject.create({
    data: createData as Parameters<typeof prisma.dataMigrationObject.create>[0]["data"],
  });

  await logDecision({
    assessmentId,
    entityType: "data_migration_object",
    entityId: created.id,
    action: "DATA_MIGRATION_CREATED" as DecisionAction,
    newValue: JSON.parse(JSON.stringify(parsed.data)) as Record<string, string>,
    actor: user.id,
    actorRole: user.role as UserRole,
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
