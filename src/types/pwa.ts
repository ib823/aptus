/** PWA, offline sync, and performance monitoring types (Phase 27) */

export type SyncAction = "classify_step" | "add_note" | "create_gap" | "update_scope";
export type SyncItemStatus = "pending" | "synced" | "conflict" | "failed";
export type WebVitalMetric = "LCP" | "FID" | "CLS" | "TTFB" | "FCP" | "INP";
export type VitalRating = "good" | "needs-improvement" | "poor";
export type HealthStatus = "healthy" | "degraded" | "unhealthy";
export type ServiceStatus = "up" | "down" | "not_configured";

export interface OfflineSyncItem {
  clientId: string;
  action: SyncAction;
  assessmentId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

export interface SyncResult {
  synced: number;
  conflicts: number;
  failed: number;
}

export interface SyncConflict {
  clientId: string;
  serverValue: unknown;
  clientValue: unknown;
  serverTimestamp: string;
}

export interface HealthCheck {
  status: HealthStatus;
  timestamp: string;
  version: string;
  checks: {
    database: { status: ServiceStatus; latencyMs: number };
  };
}

export interface PerformanceReport {
  route: string;
  metrics: Array<{
    name: WebVitalMetric;
    value: number;
    rating: VitalRating;
  }>;
}

export const TOUCH_TARGETS = {
  minimum: 44,
  comfortable: 48,
  spacing: 8,
} as const;

export const SYNC_QUEUE_MAX = 500;
export const SYNC_BATCH_SIZE = 25;
