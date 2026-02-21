/** Register data queries — Integration, Data Migration, OCM */

import { prisma } from "@/lib/db/prisma";
import { calculateWeightedReadiness, generateHeatmapData } from "@/lib/assessment/ocm-scoring";

// ========================================================
// Integration Points (Phase 14)
// ========================================================

export async function getIntegrationPoints(
  assessmentId: string,
  opts?: {
    status?: string | undefined;
    direction?: string | undefined;
    interfaceType?: string | undefined;
    priority?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
) {
  const limit = opts?.limit ?? 50;
  const where: Record<string, unknown> = { assessmentId };
  if (opts?.status) where.status = opts.status;
  if (opts?.direction) where.direction = opts.direction;
  if (opts?.interfaceType) where.interfaceType = opts.interfaceType;
  if (opts?.priority) where.priority = opts.priority;

  const items = await prisma.integrationPoint.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return {
    data: items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    hasMore,
  };
}

export async function getIntegrationSummary(assessmentId: string) {
  const items = await prisma.integrationPoint.findMany({
    where: { assessmentId },
    select: {
      direction: true,
      status: true,
      complexity: true,
      interfaceType: true,
    },
  });

  const total = items.length;
  const byDirection: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byComplexity: Record<string, number> = {};
  const byInterfaceType: Record<string, number> = {};

  for (const item of items) {
    byDirection[item.direction] = (byDirection[item.direction] ?? 0) + 1;
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    if (item.complexity) {
      byComplexity[item.complexity] = (byComplexity[item.complexity] ?? 0) + 1;
    }
    byInterfaceType[item.interfaceType] = (byInterfaceType[item.interfaceType] ?? 0) + 1;
  }

  return { total, byDirection, byStatus, byComplexity, byInterfaceType };
}

// ========================================================
// Data Migration Objects (Phase 15)
// ========================================================

export async function getDataMigrationObjects(
  assessmentId: string,
  opts?: {
    status?: string | undefined;
    objectType?: string | undefined;
    priority?: string | undefined;
    mappingComplexity?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
) {
  const limit = opts?.limit ?? 50;
  const where: Record<string, unknown> = { assessmentId };
  if (opts?.status) where.status = opts.status;
  if (opts?.objectType) where.objectType = opts.objectType;
  if (opts?.priority) where.priority = opts.priority;
  if (opts?.mappingComplexity) where.mappingComplexity = opts.mappingComplexity;

  const items = await prisma.dataMigrationObject.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return {
    data: items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    hasMore,
  };
}

export async function getDataMigrationSummary(assessmentId: string) {
  const items = await prisma.dataMigrationObject.findMany({
    where: { assessmentId },
    select: {
      objectType: true,
      status: true,
      mappingComplexity: true,
      recordCount: true,
    },
  });

  const total = items.length;
  const byObjectType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byMappingComplexity: Record<string, number> = {};
  let totalRecordCount = 0;

  for (const item of items) {
    byObjectType[item.objectType] = (byObjectType[item.objectType] ?? 0) + 1;
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    if (item.mappingComplexity) {
      byMappingComplexity[item.mappingComplexity] = (byMappingComplexity[item.mappingComplexity] ?? 0) + 1;
    }
    totalRecordCount += item.recordCount ?? 0;
  }

  return { total, byObjectType, byStatus, byMappingComplexity, totalRecordCount };
}

// ========================================================
// OCM Impacts (Phase 16)
// ========================================================

export async function getOcmImpacts(
  assessmentId: string,
  opts?: {
    status?: string | undefined;
    changeType?: string | undefined;
    severity?: string | undefined;
    resistanceRisk?: string | undefined;
    functionalArea?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
) {
  const limit = opts?.limit ?? 50;
  const where: Record<string, unknown> = { assessmentId };
  if (opts?.status) where.status = opts.status;
  if (opts?.changeType) where.changeType = opts.changeType;
  if (opts?.severity) where.severity = opts.severity;
  if (opts?.resistanceRisk) where.resistanceRisk = opts.resistanceRisk;
  if (opts?.functionalArea) where.functionalArea = opts.functionalArea;

  const items = await prisma.ocmImpact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return {
    data: items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    hasMore,
  };
}

export async function getOcmSummary(assessmentId: string) {
  const items = await prisma.ocmImpact.findMany({
    where: { assessmentId },
    select: {
      changeType: true,
      severity: true,
      status: true,
      readinessScore: true,
      trainingRequired: true,
      trainingDuration: true,
    },
  });

  const total = items.length;
  const byChangeType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let trainingCount = 0;

  for (const item of items) {
    byChangeType[item.changeType] = (byChangeType[item.changeType] ?? 0) + 1;
    bySeverity[item.severity] = (bySeverity[item.severity] ?? 0) + 1;
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    if (item.trainingRequired) trainingCount++;
  }

  const weightedReadiness = calculateWeightedReadiness(
    items.map((i) => ({ severity: i.severity, readinessScore: i.readinessScore })),
  );

  return { total, byChangeType, bySeverity, byStatus, weightedReadiness, trainingCount };
}

export async function getOcmHeatmap(assessmentId: string) {
  const items = await prisma.ocmImpact.findMany({
    where: { assessmentId },
    select: {
      impactedRole: true,
      functionalArea: true,
      severity: true,
    },
  });

  return generateHeatmapData(items);
}
