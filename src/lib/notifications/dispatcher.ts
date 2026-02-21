import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { NotificationType } from "@/types/notification";
import { FORCED_IN_APP_TYPES } from "@/types/notification";

export interface DispatchPayload {
  type: NotificationType;
  assessmentId?: string | undefined;
  title: string;
  body: string;
  deepLink?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  recipientUserIds: string[];
  priority?: "low" | "normal" | "high" | undefined;
}

export interface DispatchResult {
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Central notification dispatcher.
 * Creates in_app notifications based on user preferences.
 * Email/push are no-ops in this implementation (infrastructure not yet configured).
 */
export async function dispatchNotification(payload: DispatchPayload): Promise<DispatchResult> {
  const { type, assessmentId, title, body, deepLink, metadata, recipientUserIds } = payload;
  let sent = 0;
  let skipped = 0;
  const errors = 0;

  if (recipientUserIds.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Look up preferences for all recipients
  const preferences = await prisma.notificationPreference.findMany({
    where: { userId: { in: recipientUserIds }, notificationType: type },
  });
  const prefMap = new Map(preferences.map((p) => [p.userId, p]));

  // Deduplicate: check for existing notifications within 60s window
  const recentCutoff = new Date(Date.now() - 60_000);

  // Build where clause conditionally to satisfy exactOptionalPropertyTypes
  const recentWhere: Prisma.NotificationWhereInput = {
    userId: { in: recipientUserIds },
    type,
    sentAt: { gte: recentCutoff },
  };
  if (assessmentId !== undefined) recentWhere.assessmentId = assessmentId;
  if (deepLink !== undefined) recentWhere.deepLink = deepLink;

  const recentNotifications = await prisma.notification.findMany({
    where: recentWhere,
    select: { userId: true },
  });
  const recentUserIds = new Set(recentNotifications.map((n) => n.userId));

  const notificationsToCreate: Prisma.NotificationCreateManyInput[] = [];

  for (const userId of recipientUserIds) {
    // Deduplicate
    if (recentUserIds.has(userId)) {
      skipped++;
      continue;
    }

    const pref = prefMap.get(userId);
    const isForcedInApp = FORCED_IN_APP_TYPES.includes(type);

    // Check if in_app channel is enabled (or forced)
    const inAppEnabled = isForcedInApp || !pref || pref.channelInApp;

    if (inAppEnabled) {
      const record: Prisma.NotificationCreateManyInput = {
        userId,
        type,
        title,
        body,
        channel: "in_app",
      };
      if (assessmentId !== undefined) record.assessmentId = assessmentId;
      if (deepLink !== undefined) record.deepLink = deepLink;
      if (metadata !== undefined) {
        record.metadata = metadata as Prisma.InputJsonValue;
      }
      notificationsToCreate.push(record);
      sent++;
    } else {
      skipped++;
    }
  }

  if (notificationsToCreate.length > 0) {
    await prisma.notification.createMany({ data: notificationsToCreate });
  }

  return { sent, skipped, errors };
}
