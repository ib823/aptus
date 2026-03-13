import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ActivityActionType } from "@/types/notification";

/**
 * Log an activity to the assessment's activity feed.
 * Thin wrapper around prisma.activityFeedEntry.create().
 */
export async function logActivity(params: {
  assessmentId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  actionType: ActivityActionType;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  areaCode?: string;
}): Promise<void> {
  const data: Prisma.ActivityFeedEntryUncheckedCreateInput = {
    assessmentId: params.assessmentId,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    actionType: params.actionType,
    summary: params.summary,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    areaCode: params.areaCode ?? null,
  };

  if (params.metadata) {
    data.metadata = params.metadata as Prisma.InputJsonValue;
  }

  await prisma.activityFeedEntry.create({ data });
}
