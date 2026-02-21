/** Unit tests for PWA types and constants (Phase 27) */

import { describe, it, expect } from "vitest";
import {
  TOUCH_TARGETS,
  SYNC_QUEUE_MAX,
  SYNC_BATCH_SIZE,
} from "@/types/pwa";
import type {
  SyncAction,
  SyncItemStatus,
  WebVitalMetric,
  VitalRating,
  HealthStatus,
  ServiceStatus,
  OfflineSyncItem,
  HealthCheck,
} from "@/types/pwa";

describe("TOUCH_TARGETS", () => {
  it("minimum is 44", () => {
    expect(TOUCH_TARGETS.minimum).toBe(44);
  });

  it("comfortable is 48", () => {
    expect(TOUCH_TARGETS.comfortable).toBe(48);
  });

  it("spacing is 8", () => {
    expect(TOUCH_TARGETS.spacing).toBe(8);
  });

  it("is readonly (frozen-like)", () => {
    // as const makes it readonly at type level
    const targets: { readonly minimum: 44; readonly comfortable: 48; readonly spacing: 8 } = TOUCH_TARGETS;
    expect(targets.minimum).toBe(44);
  });
});

describe("SYNC_QUEUE_MAX", () => {
  it("is 500", () => {
    expect(SYNC_QUEUE_MAX).toBe(500);
  });
});

describe("SYNC_BATCH_SIZE", () => {
  it("is 25", () => {
    expect(SYNC_BATCH_SIZE).toBe(25);
  });
});

describe("Type compatibility", () => {
  it("SyncAction values are assignable", () => {
    const actions: SyncAction[] = ["classify_step", "add_note", "create_gap", "update_scope"];
    expect(actions).toHaveLength(4);
  });

  it("SyncItemStatus values are assignable", () => {
    const statuses: SyncItemStatus[] = ["pending", "synced", "conflict", "failed"];
    expect(statuses).toHaveLength(4);
  });

  it("WebVitalMetric values are assignable", () => {
    const metrics: WebVitalMetric[] = ["LCP", "FID", "CLS", "TTFB", "FCP", "INP"];
    expect(metrics).toHaveLength(6);
  });

  it("VitalRating values are assignable", () => {
    const ratings: VitalRating[] = ["good", "needs-improvement", "poor"];
    expect(ratings).toHaveLength(3);
  });

  it("HealthStatus values are assignable", () => {
    const statuses: HealthStatus[] = ["healthy", "degraded", "unhealthy"];
    expect(statuses).toHaveLength(3);
  });

  it("ServiceStatus values are assignable", () => {
    const statuses: ServiceStatus[] = ["up", "down", "not_configured"];
    expect(statuses).toHaveLength(3);
  });

  it("OfflineSyncItem structure is valid", () => {
    const item: OfflineSyncItem = {
      clientId: "c1",
      action: "classify_step",
      assessmentId: "a1",
      payload: { key: "value" },
      queuedAt: "2025-01-01T00:00:00Z",
    };
    expect(item.clientId).toBe("c1");
  });

  it("HealthCheck structure is valid", () => {
    const check: HealthCheck = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      checks: {
        database: { status: "up", latencyMs: 10 },
      },
    };
    expect(check.status).toBe("healthy");
  });
});
