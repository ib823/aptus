/**
 * ABeam Workbench — Presales conversion funnel.
 *
 * The 32-event audit vocabulary in audit-events.ts already records a complete
 * prospect journey (bundle_sent → landing_viewed → otp_verified →
 * session_started → decision_set → signoff_completed), indexed by
 * [bundleId, createdAt]. Until now its only consumers were per-bundle: the
 * audit page and the CSV export. This module is the cross-bundle read — which
 * prospects stall where, and how long the journey takes when it completes.
 *
 * A funnel stage counts BUNDLES that reached it, not raw events: a guest who
 * views a scope forty times is one bundle at `landing_viewed`, not forty.
 */

import { prisma } from '@/lib/db/prisma';
import type { PresalesAuditEventType } from '@/lib/presales/audit-events';

/** Journey stages in funnel order. Every entry is a PresalesAuditEventType. */
export const FUNNEL_STAGES = [
  'bundle_created',
  'bundle_sent',
  'landing_viewed',
  'otp_verified',
  'session_started',
  'decision_set',
  'signoff_completed',
  'pdf_downloaded',
] as const satisfies readonly PresalesAuditEventType[];

/** Drop-off signals surfaced beside the funnel. */
const DROPOFF_EVENTS = [
  'otp_failed',
  'session_expired',
  'bundle_revoked',
  'bundle_expired_swept',
] as const satisfies readonly PresalesAuditEventType[];

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface FunnelEventRow {
  bundleId: string | null;
  eventType: string;
  createdAt: Date;
}

export interface PresalesFunnel {
  /** Bundles that reached each stage, in journey order. */
  stages: Array<{ stage: FunnelStage; bundles: number }>;
  dropoff: {
    otpFailures: number;
    expiredSessions: number;
    revokedBundles: number;
    expiredBundles: number;
  };
  /** bundle_sent → first landing_viewed, median across converting bundles. */
  medianHoursToFirstView: number | null;
  /** bundle_sent → signoff_completed, median across signed bundles. */
  medianHoursToSignoff: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : sorted[mid] ?? 0;
  return Math.round(value * 10) / 10;
}

/** Pure aggregation over event rows — exported for tests. */
export function aggregateFunnel(events: FunnelEventRow[]): PresalesFunnel {
  const stageBundles = new Map<string, Set<string>>();
  const firstAt = new Map<string, Map<string, Date>>();
  const dropoffCounts = new Map<string, number>();

  for (const event of events) {
    if ((DROPOFF_EVENTS as readonly string[]).includes(event.eventType)) {
      dropoffCounts.set(event.eventType, (dropoffCounts.get(event.eventType) ?? 0) + 1);
    }
    if (!event.bundleId) continue;
    let bundles = stageBundles.get(event.eventType);
    if (!bundles) {
      bundles = new Set();
      stageBundles.set(event.eventType, bundles);
    }
    bundles.add(event.bundleId);

    let perBundle = firstAt.get(event.bundleId);
    if (!perBundle) {
      perBundle = new Map();
      firstAt.set(event.bundleId, perBundle);
    }
    const prior = perBundle.get(event.eventType);
    if (!prior || event.createdAt < prior) perBundle.set(event.eventType, event.createdAt);
  }

  const hoursBetween = (from: FunnelStage, to: FunnelStage): number[] => {
    const out: number[] = [];
    for (const perBundle of firstAt.values()) {
      const a = perBundle.get(from);
      const b = perBundle.get(to);
      if (a && b && b >= a) out.push((b.getTime() - a.getTime()) / 3_600_000);
    }
    return out;
  };

  return {
    stages: FUNNEL_STAGES.map((stage) => ({
      stage,
      bundles: stageBundles.get(stage)?.size ?? 0,
    })),
    dropoff: {
      otpFailures: dropoffCounts.get('otp_failed') ?? 0,
      expiredSessions: dropoffCounts.get('session_expired') ?? 0,
      revokedBundles: dropoffCounts.get('bundle_revoked') ?? 0,
      expiredBundles: dropoffCounts.get('bundle_expired_swept') ?? 0,
    },
    medianHoursToFirstView: median(hoursBetween('bundle_sent', 'landing_viewed')),
    medianHoursToSignoff: median(hoursBetween('bundle_sent', 'signoff_completed')),
  };
}

const DEFAULT_WINDOW_DAYS = 90;

/**
 * Compute the funnel for one organization's bundles.
 *
 * `organizationId: null` is the platform_admin cross-tenant view; every other
 * caller must be rejected by lacksTenantScope() BEFORE calling this — passing
 * null here widens the query to all organizations by design.
 */
export async function computePresalesFunnel(
  organizationId: string | null,
  since?: Date,
): Promise<PresalesFunnel & { since: Date }> {
  const windowStart =
    since ?? new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const events = await prisma.presalesAuditEvent.findMany({
    where: {
      createdAt: { gte: windowStart },
      eventType: { in: [...FUNNEL_STAGES, ...DROPOFF_EVENTS] },
      ...(organizationId ? { bundle: { organizationId } } : {}),
    },
    select: { bundleId: true, eventType: true, createdAt: true },
  });

  return { ...aggregateFunnel(events), since: windowStart };
}
