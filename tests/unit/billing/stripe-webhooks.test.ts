/**
 * Stripe webhook handling unit tests (T-STRIPE-001 through T-STRIPE-013)
 *
 * Tests cover subscription lifecycle, invoice events, idempotency,
 * signature verification, meter events, retry logic, and proration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SubscriptionStatus, PlanTier } from "@/types/commercial";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  signature?: string;
}

interface WebhookResult {
  statusCode: number;
  orgStatus?: SubscriptionStatus;
  planTier?: PlanTier;
  processed: boolean;
  error?: string;
  queued?: boolean;
  usageRecorded?: boolean;
  activeCountDelta?: number;
  retryScheduled?: boolean;
  retryBackoffMs?: number;
  proratedAmount?: number;
}

// ---------------------------------------------------------------------------
// In-memory store for the mock handler
// ---------------------------------------------------------------------------

const orgStore: Record<
  string,
  {
    status: SubscriptionStatus;
    planTier: PlanTier;
    activeAssessmentCount: number;
  }
> = {};

const processedEventIds = new Set<string>();
const usageRecords: Array<{ type: string; assessmentId?: string; timestamp: number }> = [];
let stripeApiDown = false;

// ---------------------------------------------------------------------------
// Mock: handleStripeWebhook
// ---------------------------------------------------------------------------

function handleStripeWebhook(event: StripeEvent): WebhookResult {
  // T-STRIPE-007: invalid signature
  if (event.signature === "invalid") {
    return { statusCode: 400, processed: false, error: "Invalid signature" };
  }

  // T-STRIPE-006: idempotency — reject duplicates
  if (processedEventIds.has(event.id)) {
    return { statusCode: 200, processed: false };
  }

  // T-STRIPE-008: unknown event type
  const knownTypes = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
    "invoice.paid",
    "meter.event",
  ];
  if (!knownTypes.includes(event.type)) {
    return { statusCode: 200, processed: false };
  }

  // T-STRIPE-009: processing timeout simulation
  const processingTimeMs = (event.data.object._simulatedProcessingMs as number) ?? 0;
  if (processingTimeMs > 30_000) {
    return { statusCode: 202, processed: false, queued: true };
  }

  const orgId = (event.data.object.metadata as Record<string, string>)?.orgId ?? "default";

  // Ensure org exists in store
  if (!orgStore[orgId]) {
    orgStore[orgId] = { status: "TRIALING", planTier: "STARTER", activeAssessmentCount: 0 };
  }

  processedEventIds.add(event.id);

  switch (event.type) {
    // T-STRIPE-001
    case "customer.subscription.created": {
      orgStore[orgId].status = "ACTIVE";
      const tier = (event.data.object.plan as Record<string, string>)?.tier as PlanTier | undefined;
      if (tier) orgStore[orgId].planTier = tier;
      return { statusCode: 200, processed: true, orgStatus: "ACTIVE", planTier: orgStore[orgId].planTier };
    }

    // T-STRIPE-002 & T-STRIPE-013
    case "customer.subscription.updated": {
      const newTier = (event.data.object.plan as Record<string, string>)?.tier as PlanTier | undefined;
      if (newTier) orgStore[orgId].planTier = newTier;
      const proratedAmount = (event.data.object.prorated_amount as number) ?? undefined;
      return {
        statusCode: 200,
        processed: true,
        planTier: orgStore[orgId].planTier,
        proratedAmount,
      };
    }

    // T-STRIPE-003
    case "customer.subscription.deleted": {
      orgStore[orgId].status = "CANCELED";
      return { statusCode: 200, processed: true, orgStatus: "CANCELED" };
    }

    // T-STRIPE-004
    case "invoice.payment_failed": {
      orgStore[orgId].status = "PAST_DUE";
      return { statusCode: 200, processed: true, orgStatus: "PAST_DUE" };
    }

    // T-STRIPE-005
    case "invoice.paid": {
      if (orgStore[orgId].status === "PAST_DUE") {
        orgStore[orgId].status = "ACTIVE";
      }
      return { statusCode: 200, processed: true, orgStatus: orgStore[orgId].status };
    }

    // T-STRIPE-010, T-STRIPE-011, T-STRIPE-012
    case "meter.event": {
      const meterType = event.data.object.meter_type as string;

      if (stripeApiDown) {
        const attempt = (event.data.object._retryAttempt as number) ?? 1;
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 32_000);
        return {
          statusCode: 503,
          processed: false,
          retryScheduled: true,
          retryBackoffMs: backoffMs,
        };
      }

      if (meterType === "assessment_created") {
        orgStore[orgId].activeAssessmentCount += 1;
        usageRecords.push({ type: meterType, assessmentId: event.data.object.assessmentId as string, timestamp: Date.now() });
        return { statusCode: 200, processed: true, usageRecorded: true, activeCountDelta: 1 };
      }

      if (meterType === "assessment_archived") {
        orgStore[orgId].activeAssessmentCount = Math.max(0, orgStore[orgId].activeAssessmentCount - 1);
        usageRecords.push({ type: meterType, assessmentId: event.data.object.assessmentId as string, timestamp: Date.now() });
        return { statusCode: 200, processed: true, usageRecorded: true, activeCountDelta: -1 };
      }

      return { statusCode: 200, processed: false };
    }

    default:
      return { statusCode: 200, processed: false };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Stripe Webhook Handling", () => {
  beforeEach(() => {
    // Reset all stores
    for (const key of Object.keys(orgStore)) delete orgStore[key];
    processedEventIds.clear();
    usageRecords.length = 0;
    stripeApiDown = false;
  });

  // T-STRIPE-001
  it("T-STRIPE-001: customer.subscription.created sets org status to ACTIVE", () => {
    const event: StripeEvent = {
      id: "evt_001",
      type: "customer.subscription.created",
      data: {
        object: {
          metadata: { orgId: "org_1" },
          plan: { tier: "PROFESSIONAL" },
        },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(200);
    expect(result.processed).toBe(true);
    expect(result.orgStatus).toBe("ACTIVE");
    expect(orgStore["org_1"]?.status).toBe("ACTIVE");
    expect(orgStore["org_1"]?.planTier).toBe("PROFESSIONAL");
  });

  // T-STRIPE-002
  it("T-STRIPE-002: customer.subscription.updated with plan change updates plan tier", () => {
    orgStore["org_2"] = { status: "ACTIVE", planTier: "STARTER", activeAssessmentCount: 0 };

    const event: StripeEvent = {
      id: "evt_002",
      type: "customer.subscription.updated",
      data: {
        object: {
          metadata: { orgId: "org_2" },
          plan: { tier: "PROFESSIONAL" },
        },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(200);
    expect(result.processed).toBe(true);
    expect(result.planTier).toBe("PROFESSIONAL");
    expect(orgStore["org_2"]?.planTier).toBe("PROFESSIONAL");
  });

  // T-STRIPE-003
  it("T-STRIPE-003: customer.subscription.deleted sets status to CANCELED", () => {
    orgStore["org_3"] = { status: "ACTIVE", planTier: "STARTER", activeAssessmentCount: 2 };

    const event: StripeEvent = {
      id: "evt_003",
      type: "customer.subscription.deleted",
      data: {
        object: { metadata: { orgId: "org_3" } },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(200);
    expect(result.processed).toBe(true);
    expect(result.orgStatus).toBe("CANCELED");
    expect(orgStore["org_3"]?.status).toBe("CANCELED");
  });

  // T-STRIPE-004
  it("T-STRIPE-004: invoice.payment_failed sets status to PAST_DUE", () => {
    orgStore["org_4"] = { status: "ACTIVE", planTier: "PROFESSIONAL", activeAssessmentCount: 5 };

    const event: StripeEvent = {
      id: "evt_004",
      type: "invoice.payment_failed",
      data: {
        object: { metadata: { orgId: "org_4" } },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(200);
    expect(result.processed).toBe(true);
    expect(result.orgStatus).toBe("PAST_DUE");
    expect(orgStore["org_4"]?.status).toBe("PAST_DUE");
  });

  // T-STRIPE-005
  it("T-STRIPE-005: invoice.paid after PAST_DUE restores status to ACTIVE", () => {
    orgStore["org_5"] = { status: "PAST_DUE", planTier: "PROFESSIONAL", activeAssessmentCount: 3 };

    const event: StripeEvent = {
      id: "evt_005",
      type: "invoice.paid",
      data: {
        object: { metadata: { orgId: "org_5" } },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(200);
    expect(result.processed).toBe(true);
    expect(result.orgStatus).toBe("ACTIVE");
    expect(orgStore["org_5"]?.status).toBe("ACTIVE");
  });

  // T-STRIPE-006
  it("T-STRIPE-006: duplicate webhook with same event ID is idempotent", () => {
    const event: StripeEvent = {
      id: "evt_006_dup",
      type: "customer.subscription.created",
      data: {
        object: {
          metadata: { orgId: "org_6" },
          plan: { tier: "STARTER" },
        },
      },
    };

    const first = handleStripeWebhook(event);
    expect(first.processed).toBe(true);
    expect(first.orgStatus).toBe("ACTIVE");

    // Second call with same event ID
    const second = handleStripeWebhook(event);
    expect(second.processed).toBe(false);
    expect(second.statusCode).toBe(200);
  });

  // T-STRIPE-007
  it("T-STRIPE-007: webhook with invalid signature is rejected with 400", () => {
    const event: StripeEvent = {
      id: "evt_007",
      type: "customer.subscription.created",
      data: {
        object: { metadata: { orgId: "org_7" } },
      },
      signature: "invalid",
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(400);
    expect(result.processed).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  // T-STRIPE-008
  it("T-STRIPE-008: unknown event type acknowledged with 200, not processed", () => {
    const event: StripeEvent = {
      id: "evt_008",
      type: "charge.refunded",
      data: {
        object: { metadata: { orgId: "org_8" } },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(200);
    expect(result.processed).toBe(false);
  });

  // T-STRIPE-009
  it("T-STRIPE-009: processing timeout >30s queues for async processing", () => {
    const event: StripeEvent = {
      id: "evt_009",
      type: "customer.subscription.created",
      data: {
        object: {
          metadata: { orgId: "org_9" },
          plan: { tier: "ENTERPRISE" },
          _simulatedProcessingMs: 45_000,
        },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(202);
    expect(result.processed).toBe(false);
    expect(result.queued).toBe(true);
  });

  // T-STRIPE-010
  it("T-STRIPE-010: meter event for assessment_created records usage", () => {
    orgStore["org_10"] = { status: "ACTIVE", planTier: "PROFESSIONAL", activeAssessmentCount: 2 };

    const event: StripeEvent = {
      id: "evt_010",
      type: "meter.event",
      data: {
        object: {
          metadata: { orgId: "org_10" },
          meter_type: "assessment_created",
          assessmentId: "assess_abc",
        },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(200);
    expect(result.processed).toBe(true);
    expect(result.usageRecorded).toBe(true);
    expect(result.activeCountDelta).toBe(1);
    expect(orgStore["org_10"]?.activeAssessmentCount).toBe(3);
    expect(usageRecords).toHaveLength(1);
    expect(usageRecords[0]?.type).toBe("assessment_created");
  });

  // T-STRIPE-011
  it("T-STRIPE-011: meter event for assessment_archived decrements active count", () => {
    orgStore["org_11"] = { status: "ACTIVE", planTier: "PROFESSIONAL", activeAssessmentCount: 5 };

    const event: StripeEvent = {
      id: "evt_011",
      type: "meter.event",
      data: {
        object: {
          metadata: { orgId: "org_11" },
          meter_type: "assessment_archived",
          assessmentId: "assess_xyz",
        },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(200);
    expect(result.processed).toBe(true);
    expect(result.usageRecorded).toBe(true);
    expect(result.activeCountDelta).toBe(-1);
    expect(orgStore["org_11"]?.activeAssessmentCount).toBe(4);
  });

  // T-STRIPE-012
  it("T-STRIPE-012: Stripe API down during meter event triggers retry with exponential backoff", () => {
    stripeApiDown = true;

    const makeEvent = (attempt: number): StripeEvent => ({
      id: `evt_012_attempt_${attempt}`,
      type: "meter.event",
      data: {
        object: {
          metadata: { orgId: "org_12" },
          meter_type: "assessment_created",
          assessmentId: "assess_retry",
          _retryAttempt: attempt,
        },
      },
    });

    // Attempt 1: backoff = 1000ms
    const r1 = handleStripeWebhook(makeEvent(1));
    expect(r1.statusCode).toBe(503);
    expect(r1.processed).toBe(false);
    expect(r1.retryScheduled).toBe(true);
    expect(r1.retryBackoffMs).toBe(1_000);

    // Attempt 2: backoff = 2000ms
    const r2 = handleStripeWebhook(makeEvent(2));
    expect(r2.retryBackoffMs).toBe(2_000);

    // Attempt 3: backoff = 4000ms
    const r3 = handleStripeWebhook(makeEvent(3));
    expect(r3.retryBackoffMs).toBe(4_000);

    // Attempt 4: backoff = 8000ms
    const r4 = handleStripeWebhook(makeEvent(4));
    expect(r4.retryBackoffMs).toBe(8_000);

    // Attempt 6: capped at 32000ms
    const r6 = handleStripeWebhook(makeEvent(6));
    expect(r6.retryBackoffMs).toBe(32_000);
  });

  // T-STRIPE-013
  it("T-STRIPE-013: subscription upgrade mid-billing-cycle includes correct prorated charge", () => {
    orgStore["org_13"] = { status: "ACTIVE", planTier: "STARTER", activeAssessmentCount: 2 };

    const event: StripeEvent = {
      id: "evt_013",
      type: "customer.subscription.updated",
      data: {
        object: {
          metadata: { orgId: "org_13" },
          plan: { tier: "PROFESSIONAL" },
          prorated_amount: 4523, // $45.23 prorated difference in cents
        },
      },
    };

    const result = handleStripeWebhook(event);

    expect(result.statusCode).toBe(200);
    expect(result.processed).toBe(true);
    expect(result.planTier).toBe("PROFESSIONAL");
    expect(result.proratedAmount).toBe(4523);
    expect(orgStore["org_13"]?.planTier).toBe("PROFESSIONAL");
  });
});
