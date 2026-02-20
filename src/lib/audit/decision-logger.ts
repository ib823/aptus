/** Decision log utilities — append-only audit trail */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DecisionAction, UserRole } from "@/types/assessment";
import type { JsonValue, InputJsonValue } from "@prisma/client/runtime/library";

interface LogEntryInput {
  assessmentId: string;
  entityType: string;
  entityId: string;
  action: DecisionAction;
  oldValue?: InputJsonValue | undefined;
  newValue: InputJsonValue;
  actor: string;
  actorRole: UserRole;
  reason?: string;
}

/**
 * Log a decision to the append-only audit trail.
 * This is the ONLY way to write to the DecisionLogEntry table.
 * No update or delete operations are exposed.
 */
export async function logDecision(entry: LogEntryInput): Promise<void> {
  await prisma.decisionLogEntry.create({
    data: {
      assessmentId: entry.assessmentId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      oldValue: entry.oldValue ?? Prisma.JsonNull,
      newValue: entry.newValue,
      actor: entry.actor,
      actorRole: entry.actorRole,
      reason: entry.reason ?? null,
    },
  });
}

/**
 * Query decision log entries for an assessment.
 * Read-only — this is the only query operation allowed.
 */
export async function getDecisionLog(
  assessmentId: string,
  options?: {
    entityType?: string;
    actor?: string;
    cursor?: string;
    limit?: number;
  },
): Promise<{
  entries: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    oldValue: JsonValue;
    newValue: JsonValue;
    actor: string;
    actorRole: string;
    timestamp: Date;
    reason: string | null;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = options?.limit ?? 50;

  const where: Record<string, unknown> = { assessmentId };
  if (options?.entityType) where.entityType = options.entityType;
  if (options?.actor) where.actor = options.actor;

  const entries = await prisma.decisionLogEntry.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: limit + 1,
    ...(options?.cursor
      ? { cursor: { id: options.cursor }, skip: 1 }
      : {}),
    select: {
      id: true,
      entityType: true,
      entityId: true,
      action: true,
      oldValue: true,
      newValue: true,
      actor: true,
      actorRole: true,
      timestamp: true,
      reason: true,
    },
  });

  const hasMore = entries.length > limit;
  if (hasMore) entries.pop();

  return {
    entries,
    nextCursor: hasMore ? entries[entries.length - 1]?.id ?? null : null,
    hasMore,
  };
}
