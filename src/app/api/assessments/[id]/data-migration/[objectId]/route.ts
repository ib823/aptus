/** PUT: Update data migration object, DELETE: Delete data migration object */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/db/decision-log";
import { detectCircularDependency } from "@/lib/assessment/dependency-graph";
import { ERROR_CODES } from "@/types/api";
import type { DecisionAction, UserRole } from "@/types/assessment";

const UpdateDataMigrationSchema = z.object({
  objectName: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  objectType: z.enum(["MASTER_DATA", "TRANSACTION_DATA", "CONFIG_DATA", "HISTORICAL", "REFERENCE"]).optional(),
  sourceSystem: z.string().min(1).max(200).optional(),
  sourceFormat: z.enum(["SAP_TABLE", "CSV", "EXCEL", "XML", "DATABASE", "API"]).nullable().optional(),
  volumeEstimate: z.enum(["SMALL", "MEDIUM", "LARGE", "VERY_LARGE"]).nullable().optional(),
  recordCount: z.number().int().min(0).nullable().optional(),
  cleansingRequired: z.boolean().optional(),
  cleansingNotes: z.string().max(5000).nullable().optional(),
  mappingComplexity: z.enum(["SIMPLE", "MODERATE", "COMPLEX", "VERY_COMPLEX"]).nullable().optional(),
  migrationApproach: z.enum(["AUTOMATED", "SEMI_AUTOMATED", "MANUAL", "HYBRID"]).nullable().optional(),
  migrationTool: z.enum(["LTMC", "LSMW", "BODS", "CPI", "CUSTOM"]).nullable().optional(),
  validationRules: z.string().max(5000).nullable().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).nullable().optional(),
  status: z.enum(["identified", "mapped", "cleansed", "validated", "approved"]).optional(),
  dependsOn: z.array(z.string()).optional(),
  scopeItemId: z.string().nullable().optional(),
  technicalNotes: z.string().max(5000).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string; objectId: string }> };

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

  const { id: assessmentId, objectId } = await params;

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

  const existing = await prisma.dataMigrationObject.findUnique({
    where: { id: objectId },
  });

  if (!existing || existing.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Data migration object not found" } },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = UpdateDataMigrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  // Circular dependency check if dependencies are being updated
  if (parsed.data.dependsOn !== undefined) {
    const allObjects = await prisma.dataMigrationObject.findMany({
      where: { assessmentId },
      select: { id: true, dependsOn: true },
    });

    const existingIds = new Set(allObjects.map((o) => o.id));
    for (const depId of parsed.data.dependsOn) {
      if (depId === objectId) {
        return NextResponse.json(
          { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "An object cannot depend on itself" } },
          { status: 400 },
        );
      }
      if (!existingIds.has(depId)) {
        return NextResponse.json(
          { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Dependency object ${depId} not found in this assessment` } },
          { status: 400 },
        );
      }
    }

    // Check each new dependency for cycles
    const newDeps = parsed.data.dependsOn.filter((d) => !existing.dependsOn.includes(d));
    for (const newDep of newDeps) {
      const result = detectCircularDependency(
        allObjects.map((o) => ({ id: o.id, dependsOn: o.id === objectId ? existing.dependsOn : o.dependsOn })),
        { from: objectId, to: newDep },
      );
      if (result.circular) {
        return NextResponse.json(
          { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Circular dependency detected: ${result.cycle.join(" -> ")}` } },
          { status: 400 },
        );
      }
    }
  }

  // Build update data, converting undefined to absent keys
  const updateData: Record<string, unknown> = {};
  if (parsed.data.objectName !== undefined) updateData.objectName = parsed.data.objectName;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.objectType !== undefined) updateData.objectType = parsed.data.objectType;
  if (parsed.data.sourceSystem !== undefined) updateData.sourceSystem = parsed.data.sourceSystem;
  if (parsed.data.sourceFormat !== undefined) updateData.sourceFormat = parsed.data.sourceFormat;
  if (parsed.data.volumeEstimate !== undefined) updateData.volumeEstimate = parsed.data.volumeEstimate;
  if (parsed.data.recordCount !== undefined) updateData.recordCount = parsed.data.recordCount;
  if (parsed.data.cleansingRequired !== undefined) updateData.cleansingRequired = parsed.data.cleansingRequired;
  if (parsed.data.cleansingNotes !== undefined) updateData.cleansingNotes = parsed.data.cleansingNotes;
  if (parsed.data.mappingComplexity !== undefined) updateData.mappingComplexity = parsed.data.mappingComplexity;
  if (parsed.data.migrationApproach !== undefined) updateData.migrationApproach = parsed.data.migrationApproach;
  if (parsed.data.migrationTool !== undefined) updateData.migrationTool = parsed.data.migrationTool;
  if (parsed.data.validationRules !== undefined) updateData.validationRules = parsed.data.validationRules;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.dependsOn !== undefined) updateData.dependsOn = parsed.data.dependsOn;
  if (parsed.data.scopeItemId !== undefined) updateData.scopeItemId = parsed.data.scopeItemId;
  if (parsed.data.technicalNotes !== undefined) updateData.technicalNotes = parsed.data.technicalNotes;

  const updated = await prisma.dataMigrationObject.update({
    where: { id: objectId },
    data: updateData,
  });

  await logDecision({
    assessmentId,
    entityType: "data_migration_object",
    entityId: objectId,
    action: "DATA_MIGRATION_UPDATED" as DecisionAction,
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

  const { id: assessmentId, objectId } = await params;

  const existing = await prisma.dataMigrationObject.findUnique({
    where: { id: objectId },
  });

  if (!existing || existing.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Data migration object not found" } },
      { status: 404 },
    );
  }

  await prisma.dataMigrationObject.delete({ where: { id: objectId } });

  await logDecision({
    assessmentId,
    entityType: "data_migration_object",
    entityId: objectId,
    action: "DATA_MIGRATION_DELETED" as DecisionAction,
    oldValue: JSON.parse(JSON.stringify(existing)) as Record<string, string>,
    newValue: { deleted: true },
    actor: user.id,
    actorRole: user.role as UserRole,
  });

  return NextResponse.json({ data: { deleted: true, id: objectId } });
}
