export interface RawActivity {
  actorId: string;
  actionType: string;
  entityType: string;
  areaCode: string | null;
  timestamp: number; // ms epoch
  metadata?: Record<string, unknown> | undefined;
}

export interface AggregatedActivity {
  actorId: string;
  actionType: string;
  entityType: string;
  areaCode: string | null;
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
  metadata?: Record<string, unknown> | undefined;
}

const AGGREGATION_WINDOW_MS = 30_000; // 30 seconds

export function aggregateActivities(activities: RawActivity[]): AggregatedActivity[] {
  if (activities.length === 0) return [];

  const sorted = [...activities].sort((a, b) => a.timestamp - b.timestamp);
  const result: AggregatedActivity[] = [];
  let current: AggregatedActivity | null = null;

  for (const activity of sorted) {
    if (
      current &&
      current.actorId === activity.actorId &&
      current.actionType === activity.actionType &&
      current.entityType === activity.entityType &&
      current.areaCode === activity.areaCode &&
      activity.timestamp - current.lastTimestamp <= AGGREGATION_WINDOW_MS
    ) {
      current.count++;
      current.lastTimestamp = activity.timestamp;
    } else {
      if (current) result.push(current);
      current = {
        actorId: activity.actorId,
        actionType: activity.actionType,
        entityType: activity.entityType,
        areaCode: activity.areaCode,
        count: 1,
        firstTimestamp: activity.timestamp,
        lastTimestamp: activity.timestamp,
        metadata: activity.metadata,
      };
    }
  }

  if (current) result.push(current);
  return result;
}
