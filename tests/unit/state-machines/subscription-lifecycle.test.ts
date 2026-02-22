import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Inline types
// ---------------------------------------------------------------------------

type SubscriptionState =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "TRIAL_EXPIRED"
  | "SUSPENDED";

interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

interface SubscriptionContext {
  trialEndDate?: Date;
  currentDate?: Date;
  billingCycleDay?: number;
  currentPlan?: string;
  targetPlan?: string;
  activeAssessmentCount?: number;
  targetPlanAssessmentLimit?: number;
  hasActiveWorkshopSession?: boolean;
  daysSinceCancellation?: number;
  reactivationWindowDays?: number;
  stripeEventId?: string;
  processedEventIds?: Set<string>;
  webhookType?: string;
  subscriptionCreated?: boolean;
  currentCurrency?: string;
  targetCurrency?: string;
  meteredUsage?: {
    assessmentsCreated: number;
    assessmentsArchived: number;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
  };
}

interface PlanChangeResult {
  allowed: boolean;
  readOnlyAssessmentIds?: string[];
  reason?: string;
  featuresUnlocked?: boolean;
}

interface WebhookProcessResult {
  processed: boolean;
  idempotent: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// State machine definition
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<SubscriptionState, SubscriptionState[]> = {
  TRIALING: ["ACTIVE", "TRIAL_EXPIRED", "CANCELED"],
  ACTIVE: ["PAST_DUE", "CANCELED", "SUSPENDED"],
  PAST_DUE: ["ACTIVE", "CANCELED", "SUSPENDED"],
  CANCELED: ["ACTIVE"], // reactivation within window
  TRIAL_EXPIRED: ["ACTIVE"], // upgrade/payment
  SUSPENDED: ["ACTIVE", "CANCELED"],
};

const ALL_STATES: SubscriptionState[] = Object.keys(VALID_TRANSITIONS) as SubscriptionState[];

// ---------------------------------------------------------------------------
// Functions under test
// ---------------------------------------------------------------------------

function validateTransition(
  from: SubscriptionState,
  to: SubscriptionState,
): TransitionResult {
  const validTargets = VALID_TRANSITIONS[from];
  if (!validTargets || !validTargets.includes(to)) {
    return {
      allowed: false,
      reason: `Invalid transition from ${from} to ${to}`,
    };
  }
  return { allowed: true };
}

function getNextStates(from: SubscriptionState): SubscriptionState[] {
  return VALID_TRANSITIONS[from] ?? [];
}

/**
 * T-SUB-001: Check trial expiration with timezone boundary logic.
 * Trial expires at exactly midnight UTC of the trialEndDate.
 */
function isTrialExpired(trialEndDate: Date, currentDate: Date): boolean {
  // Normalize to UTC midnight
  const endMidnightUTC = new Date(
    Date.UTC(trialEndDate.getUTCFullYear(), trialEndDate.getUTCMonth(), trialEndDate.getUTCDate()),
  );
  return currentDate >= endMidnightUTC;
}

/**
 * T-SUB-002: Payment failure severity depends on day in billing cycle.
 * Day 1 = grace period, Day 28 = critical.
 */
function getPaymentFailureSeverity(
  billingCycleDay: number,
): "low" | "medium" | "high" | "critical" {
  if (billingCycleDay <= 3) return "low";
  if (billingCycleDay <= 14) return "medium";
  if (billingCycleDay <= 25) return "high";
  return "critical";
}

/**
 * T-SUB-003: Upgrade from trial to enterprise mid-assessment.
 */
function processUpgrade(
  currentPlan: string,
  targetPlan: string,
  _state: SubscriptionState,
): PlanChangeResult {
  const planHierarchy: Record<string, number> = {
    trial: 0,
    starter: 1,
    professional: 2,
    enterprise: 3,
  };

  const currentLevel = planHierarchy[currentPlan] ?? -1;
  const targetLevel = planHierarchy[targetPlan] ?? -1;

  if (targetLevel <= currentLevel) {
    return { allowed: false, reason: "Target plan is not an upgrade" };
  }

  return { allowed: true, featuresUnlocked: true };
}

/**
 * T-SUB-004: Downgrade with active assessments exceeding limit.
 * Oldest assessments become read-only.
 */
function processDowngrade(
  assessmentIds: string[],
  targetPlanLimit: number,
): PlanChangeResult {
  if (assessmentIds.length <= targetPlanLimit) {
    return { allowed: true, readOnlyAssessmentIds: [] };
  }

  // Sort by index (simulating oldest-first by array order)
  const excess = assessmentIds.length - targetPlanLimit;
  const readOnlyIds = assessmentIds.slice(0, excess);

  return {
    allowed: true,
    readOnlyAssessmentIds: readOnlyIds,
  };
}

/**
 * T-SUB-005: Cancel during active workshop session.
 */
function canCancel(
  state: SubscriptionState,
  hasActiveWorkshopSession: boolean,
): TransitionResult {
  if (state === "CANCELED" || state === "TRIAL_EXPIRED") {
    return { allowed: false, reason: "Already canceled or expired" };
  }

  if (hasActiveWorkshopSession) {
    return {
      allowed: false,
      reason: "Cannot cancel during active workshop session. End or pause the session first.",
    };
  }

  const result = validateTransition(state, "CANCELED");
  return result;
}

/**
 * T-SUB-006: Reactivation within/outside window.
 */
function canReactivate(
  daysSinceCancellation: number,
  reactivationWindowDays: number,
): TransitionResult {
  if (daysSinceCancellation <= reactivationWindowDays) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Reactivation window of ${reactivationWindowDays} days has expired (${daysSinceCancellation} days since cancellation)`,
  };
}

/**
 * T-SUB-007: Stripe webhook idempotency.
 */
function processWebhookEvent(
  eventId: string,
  processedEventIds: Set<string>,
): WebhookProcessResult {
  if (processedEventIds.has(eventId)) {
    return { processed: false, idempotent: true, reason: "Duplicate event" };
  }
  processedEventIds.add(eventId);
  return { processed: true, idempotent: false };
}

/**
 * T-SUB-008: Out-of-order webhook handling.
 */
function processOutOfOrderWebhook(
  webhookType: string,
  subscriptionCreated: boolean,
): WebhookProcessResult {
  if (webhookType === "subscription.updated" && !subscriptionCreated) {
    return {
      processed: false,
      idempotent: false,
      reason: "subscription.updated received before subscription.created — queued for retry",
    };
  }
  return { processed: true, idempotent: false };
}

/**
 * T-SUB-009: Currency change on plan upgrade.
 */
function validateCurrencyChange(
  currentCurrency: string,
  targetCurrency: string,
): TransitionResult {
  if (currentCurrency !== targetCurrency) {
    return {
      allowed: false,
      reason: `Currency change from ${currentCurrency} to ${targetCurrency} requires explicit confirmation`,
    };
  }
  return { allowed: true };
}

/**
 * T-SUB-010: Metered usage billing — assessment created and archived in same period.
 */
function calculateMeteredUsage(
  assessmentsCreated: number,
  assessmentsArchived: number,
): { billableUnits: number; netActive: number } {
  // Created units are always billable even if archived in same period
  return {
    billableUnits: assessmentsCreated,
    netActive: assessmentsCreated - assessmentsArchived,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Subscription Lifecycle State Machine", () => {
  // -----------------------------------------------------------------------
  // Valid transitions
  // -----------------------------------------------------------------------
  describe("valid transitions", () => {
    const validCases: [SubscriptionState, SubscriptionState][] = [];
    for (const from of ALL_STATES) {
      for (const to of VALID_TRANSITIONS[from]) {
        validCases.push([from, to]);
      }
    }

    it.each(validCases)(
      "should allow transition from %s to %s",
      (from, to) => {
        const result = validateTransition(from, to);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      },
    );
  });

  // -----------------------------------------------------------------------
  // Invalid transitions
  // -----------------------------------------------------------------------
  describe("invalid transitions", () => {
    const invalidCases: [SubscriptionState, SubscriptionState][] = [];
    for (const from of ALL_STATES) {
      const validTargets = new Set(VALID_TRANSITIONS[from]);
      for (const to of ALL_STATES) {
        if (!validTargets.has(to)) {
          invalidCases.push([from, to]);
        }
      }
    }

    it.each(invalidCases)(
      "should reject transition from %s to %s",
      (from, to) => {
        const result = validateTransition(from, to);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Invalid transition");
      },
    );
  });

  // -----------------------------------------------------------------------
  // getNextStates
  // -----------------------------------------------------------------------
  describe("getNextStates", () => {
    it("should return ACTIVE, TRIAL_EXPIRED, CANCELED for TRIALING", () => {
      const next = getNextStates("TRIALING");
      expect(next).toHaveLength(3);
      expect(next).toContain("ACTIVE");
      expect(next).toContain("TRIAL_EXPIRED");
      expect(next).toContain("CANCELED");
    });

    it("should return ACTIVE for CANCELED (reactivation)", () => {
      const next = getNextStates("CANCELED");
      expect(next).toEqual(["ACTIVE"]);
    });

    it("should return ACTIVE for TRIAL_EXPIRED (upgrade)", () => {
      const next = getNextStates("TRIAL_EXPIRED");
      expect(next).toEqual(["ACTIVE"]);
    });

    it("should return ACTIVE and CANCELED for SUSPENDED", () => {
      const next = getNextStates("SUSPENDED");
      expect(next).toHaveLength(2);
      expect(next).toContain("ACTIVE");
      expect(next).toContain("CANCELED");
    });

    it("should return states for every known state", () => {
      for (const state of ALL_STATES) {
        const next = getNextStates(state);
        expect(Array.isArray(next)).toBe(true);
        expect(next.length).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-001: Trial expiration at midnight UTC boundary
  // -----------------------------------------------------------------------
  describe("T-SUB-001: trial expiration at midnight UTC boundary", () => {
    it("should expire trial at exactly midnight UTC of end date", () => {
      const trialEnd = new Date("2026-03-15T00:00:00Z");
      const atMidnight = new Date("2026-03-15T00:00:00Z");
      expect(isTrialExpired(trialEnd, atMidnight)).toBe(true);
    });

    it("should not expire trial 1ms before midnight UTC", () => {
      const trialEnd = new Date("2026-03-15T00:00:00Z");
      const beforeMidnight = new Date("2026-03-14T23:59:59.999Z");
      expect(isTrialExpired(trialEnd, beforeMidnight)).toBe(false);
    });

    it("should expire trial 1ms after midnight UTC", () => {
      const trialEnd = new Date("2026-03-15T00:00:00Z");
      const afterMidnight = new Date("2026-03-15T00:00:00.001Z");
      expect(isTrialExpired(trialEnd, afterMidnight)).toBe(true);
    });

    it("should handle timezone offset — 11:59 PM EST (Mar 14) is still Mar 15 04:59 UTC", () => {
      const trialEnd = new Date("2026-03-15T00:00:00Z");
      // 11:59 PM EST on Mar 14 = Mar 15 04:59 UTC
      const estTime = new Date("2026-03-15T04:59:00Z");
      expect(isTrialExpired(trialEnd, estTime)).toBe(true);
    });

    it("should not expire trial at midnight in a non-UTC timezone before UTC midnight", () => {
      const trialEnd = new Date("2026-03-15T00:00:00Z");
      // Midnight JST on Mar 15 = Mar 14 15:00 UTC
      const jstMidnight = new Date("2026-03-14T15:00:00Z");
      expect(isTrialExpired(trialEnd, jstMidnight)).toBe(false);
    });

    it("should expire a trial that ended days ago", () => {
      const trialEnd = new Date("2026-01-01T00:00:00Z");
      const now = new Date("2026-02-22T12:00:00Z");
      expect(isTrialExpired(trialEnd, now)).toBe(true);
    });

    it("should not expire a trial that ends in the future", () => {
      const trialEnd = new Date("2026-12-31T00:00:00Z");
      const now = new Date("2026-02-22T12:00:00Z");
      expect(isTrialExpired(trialEnd, now)).toBe(false);
    });

    it("TRIALING -> TRIAL_EXPIRED is a valid transition", () => {
      const result = validateTransition("TRIALING", "TRIAL_EXPIRED");
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-002: Payment failure severity by billing cycle day
  // -----------------------------------------------------------------------
  describe("T-SUB-002: payment failure severity by billing cycle day", () => {
    it("should return low severity on day 1", () => {
      expect(getPaymentFailureSeverity(1)).toBe("low");
    });

    it("should return low severity on day 3", () => {
      expect(getPaymentFailureSeverity(3)).toBe("low");
    });

    it("should return medium severity on day 4", () => {
      expect(getPaymentFailureSeverity(4)).toBe("medium");
    });

    it("should return medium severity on day 14", () => {
      expect(getPaymentFailureSeverity(14)).toBe("medium");
    });

    it("should return high severity on day 15", () => {
      expect(getPaymentFailureSeverity(15)).toBe("high");
    });

    it("should return high severity on day 25", () => {
      expect(getPaymentFailureSeverity(25)).toBe("high");
    });

    it("should return critical severity on day 26", () => {
      expect(getPaymentFailureSeverity(26)).toBe("critical");
    });

    it("should return critical severity on day 28", () => {
      expect(getPaymentFailureSeverity(28)).toBe("critical");
    });

    it("should return critical severity on day 30", () => {
      expect(getPaymentFailureSeverity(30)).toBe("critical");
    });

    it("ACTIVE -> PAST_DUE is a valid transition for payment failure", () => {
      const result = validateTransition("ACTIVE", "PAST_DUE");
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-003: Upgrade from Trial to Enterprise mid-assessment
  // -----------------------------------------------------------------------
  describe("T-SUB-003: upgrade from trial to enterprise — features unlock immediately", () => {
    it("should allow upgrade from trial to enterprise", () => {
      const result = processUpgrade("trial", "enterprise", "TRIALING");
      expect(result.allowed).toBe(true);
      expect(result.featuresUnlocked).toBe(true);
    });

    it("should allow upgrade from trial to starter", () => {
      const result = processUpgrade("trial", "starter", "TRIALING");
      expect(result.allowed).toBe(true);
      expect(result.featuresUnlocked).toBe(true);
    });

    it("should allow upgrade from starter to professional", () => {
      const result = processUpgrade("starter", "professional", "ACTIVE");
      expect(result.allowed).toBe(true);
      expect(result.featuresUnlocked).toBe(true);
    });

    it("should allow upgrade from professional to enterprise", () => {
      const result = processUpgrade("professional", "enterprise", "ACTIVE");
      expect(result.allowed).toBe(true);
      expect(result.featuresUnlocked).toBe(true);
    });

    it("should reject downgrade via upgrade function", () => {
      const result = processUpgrade("enterprise", "starter", "ACTIVE");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not an upgrade");
    });

    it("should reject same-plan upgrade", () => {
      const result = processUpgrade("professional", "professional", "ACTIVE");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not an upgrade");
    });

    it("TRIALING -> ACTIVE is valid for plan upgrade", () => {
      const result = validateTransition("TRIALING", "ACTIVE");
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-004: Downgrade with excess active assessments
  // -----------------------------------------------------------------------
  describe("T-SUB-004: downgrade from enterprise to starter — oldest become read-only", () => {
    it("should make oldest 12 assessments read-only (15 active, limit 3)", () => {
      const assessmentIds = Array.from({ length: 15 }, (_, i) => `assess-${i + 1}`);
      const result = processDowngrade(assessmentIds, 3);
      expect(result.allowed).toBe(true);
      expect(result.readOnlyAssessmentIds).toHaveLength(12);
      expect(result.readOnlyAssessmentIds![0]).toBe("assess-1");
      expect(result.readOnlyAssessmentIds![11]).toBe("assess-12");
    });

    it("should not mark any as read-only when within limit", () => {
      const assessmentIds = ["assess-1", "assess-2", "assess-3"];
      const result = processDowngrade(assessmentIds, 5);
      expect(result.allowed).toBe(true);
      expect(result.readOnlyAssessmentIds).toEqual([]);
    });

    it("should not mark any as read-only when exactly at limit", () => {
      const assessmentIds = ["assess-1", "assess-2", "assess-3"];
      const result = processDowngrade(assessmentIds, 3);
      expect(result.allowed).toBe(true);
      expect(result.readOnlyAssessmentIds).toEqual([]);
    });

    it("should mark exactly 1 as read-only when 1 over limit", () => {
      const assessmentIds = ["assess-1", "assess-2", "assess-3", "assess-4"];
      const result = processDowngrade(assessmentIds, 3);
      expect(result.readOnlyAssessmentIds).toHaveLength(1);
      expect(result.readOnlyAssessmentIds![0]).toBe("assess-1");
    });

    it("should handle downgrade from 100 to limit 5", () => {
      const assessmentIds = Array.from({ length: 100 }, (_, i) => `assess-${i + 1}`);
      const result = processDowngrade(assessmentIds, 5);
      expect(result.readOnlyAssessmentIds).toHaveLength(95);
    });

    it("should handle empty assessment list", () => {
      const result = processDowngrade([], 3);
      expect(result.allowed).toBe(true);
      expect(result.readOnlyAssessmentIds).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-005: Cancel during active workshop session
  // -----------------------------------------------------------------------
  describe("T-SUB-005: cancel during active workshop session", () => {
    it("should reject cancellation when workshop session is active", () => {
      const result = canCancel("ACTIVE", true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("active workshop session");
    });

    it("should allow cancellation when no workshop session is active", () => {
      const result = canCancel("ACTIVE", false);
      expect(result.allowed).toBe(true);
    });

    it("should reject cancellation from TRIALING with active workshop", () => {
      const result = canCancel("TRIALING", true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("active workshop session");
    });

    it("should allow cancellation from TRIALING without active workshop", () => {
      const result = canCancel("TRIALING", false);
      expect(result.allowed).toBe(true);
    });

    it("should reject cancellation from PAST_DUE with active workshop", () => {
      const result = canCancel("PAST_DUE", true);
      expect(result.allowed).toBe(false);
    });

    it("should allow cancellation from PAST_DUE without active workshop", () => {
      const result = canCancel("PAST_DUE", false);
      expect(result.allowed).toBe(true);
    });

    it("should reject cancellation from already CANCELED state", () => {
      const result = canCancel("CANCELED", false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Already canceled");
    });

    it("should reject cancellation from TRIAL_EXPIRED state", () => {
      const result = canCancel("TRIAL_EXPIRED", false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Already canceled or expired");
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-006: Reactivation within/outside window
  // -----------------------------------------------------------------------
  describe("T-SUB-006: reactivation window — 179 days vs 181 days", () => {
    const WINDOW = 180;

    it("should allow reactivation at 179 days (within window)", () => {
      const result = canReactivate(179, WINDOW);
      expect(result.allowed).toBe(true);
    });

    it("should allow reactivation at exactly 180 days (boundary)", () => {
      const result = canReactivate(180, WINDOW);
      expect(result.allowed).toBe(true);
    });

    it("should reject reactivation at 181 days (outside window)", () => {
      const result = canReactivate(181, WINDOW);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("expired");
      expect(result.reason).toContain("181");
    });

    it("should allow reactivation at 0 days (same day)", () => {
      const result = canReactivate(0, WINDOW);
      expect(result.allowed).toBe(true);
    });

    it("should allow reactivation at 1 day", () => {
      const result = canReactivate(1, WINDOW);
      expect(result.allowed).toBe(true);
    });

    it("should reject reactivation at 365 days", () => {
      const result = canReactivate(365, WINDOW);
      expect(result.allowed).toBe(false);
    });

    it("should support custom window — 90 day window at day 89", () => {
      const result = canReactivate(89, 90);
      expect(result.allowed).toBe(true);
    });

    it("should support custom window — 90 day window at day 91", () => {
      const result = canReactivate(91, 90);
      expect(result.allowed).toBe(false);
    });

    it("CANCELED -> ACTIVE is the valid reactivation path", () => {
      const result = validateTransition("CANCELED", "ACTIVE");
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-007: Stripe webhook idempotency
  // -----------------------------------------------------------------------
  describe("T-SUB-007: Stripe webhook idempotency — duplicate events", () => {
    it("should process first webhook event normally", () => {
      const processedIds = new Set<string>();
      const result = processWebhookEvent("evt_001", processedIds);
      expect(result.processed).toBe(true);
      expect(result.idempotent).toBe(false);
    });

    it("should detect duplicate webhook event", () => {
      const processedIds = new Set<string>(["evt_001"]);
      const result = processWebhookEvent("evt_001", processedIds);
      expect(result.processed).toBe(false);
      expect(result.idempotent).toBe(true);
      expect(result.reason).toContain("Duplicate");
    });

    it("should process second distinct event after first", () => {
      const processedIds = new Set<string>();
      processWebhookEvent("evt_001", processedIds);
      const result = processWebhookEvent("evt_002", processedIds);
      expect(result.processed).toBe(true);
      expect(result.idempotent).toBe(false);
    });

    it("should handle triple retry of same event", () => {
      const processedIds = new Set<string>();
      const r1 = processWebhookEvent("evt_001", processedIds);
      const r2 = processWebhookEvent("evt_001", processedIds);
      const r3 = processWebhookEvent("evt_001", processedIds);
      expect(r1.processed).toBe(true);
      expect(r2.processed).toBe(false);
      expect(r2.idempotent).toBe(true);
      expect(r3.processed).toBe(false);
      expect(r3.idempotent).toBe(true);
    });

    it("should track processed events in the set", () => {
      const processedIds = new Set<string>();
      processWebhookEvent("evt_001", processedIds);
      processWebhookEvent("evt_002", processedIds);
      expect(processedIds.size).toBe(2);
      expect(processedIds.has("evt_001")).toBe(true);
      expect(processedIds.has("evt_002")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-008: Out-of-order webhook — updated before created
  // -----------------------------------------------------------------------
  describe("T-SUB-008: out-of-order webhook handling", () => {
    it("should reject subscription.updated when subscription not yet created", () => {
      const result = processOutOfOrderWebhook("subscription.updated", false);
      expect(result.processed).toBe(false);
      expect(result.reason).toContain("before subscription.created");
    });

    it("should process subscription.updated when subscription exists", () => {
      const result = processOutOfOrderWebhook("subscription.updated", true);
      expect(result.processed).toBe(true);
    });

    it("should process subscription.created regardless of state", () => {
      const result = processOutOfOrderWebhook("subscription.created", false);
      expect(result.processed).toBe(true);
    });

    it("should process invoice.paid when subscription exists", () => {
      const result = processOutOfOrderWebhook("invoice.paid", true);
      expect(result.processed).toBe(true);
    });

    it("should process invoice.paid even when subscription not yet created", () => {
      // Only subscription.updated is gated on subscription existence
      const result = processOutOfOrderWebhook("invoice.paid", false);
      expect(result.processed).toBe(true);
    });

    it("should reject subscription.updated before created with retry reason", () => {
      const result = processOutOfOrderWebhook("subscription.updated", false);
      expect(result.reason).toContain("queued for retry");
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-009: Currency change on plan upgrade
  // -----------------------------------------------------------------------
  describe("T-SUB-009: currency change on plan upgrade", () => {
    it("should allow upgrade with same currency", () => {
      const result = validateCurrencyChange("USD", "USD");
      expect(result.allowed).toBe(true);
    });

    it("should reject upgrade with currency change (USD to EUR)", () => {
      const result = validateCurrencyChange("USD", "EUR");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Currency change");
      expect(result.reason).toContain("USD");
      expect(result.reason).toContain("EUR");
    });

    it("should reject upgrade with currency change (GBP to USD)", () => {
      const result = validateCurrencyChange("GBP", "USD");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("explicit confirmation");
    });

    it("should allow same currency EUR to EUR", () => {
      const result = validateCurrencyChange("EUR", "EUR");
      expect(result.allowed).toBe(true);
    });

    it("should reject JPY to USD change", () => {
      const result = validateCurrencyChange("JPY", "USD");
      expect(result.allowed).toBe(false);
    });

    it("should handle same currency with different casing as different", () => {
      // Currency codes should be normalized upstream, but the function is case-sensitive
      const result = validateCurrencyChange("usd", "USD");
      expect(result.allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // T-SUB-010: Metered usage billing — created and archived in same period
  // -----------------------------------------------------------------------
  describe("T-SUB-010: metered usage billing — same period create and archive", () => {
    it("should bill for assessments created even if archived in same period", () => {
      const usage = calculateMeteredUsage(5, 3);
      expect(usage.billableUnits).toBe(5);
      expect(usage.netActive).toBe(2);
    });

    it("should bill for all created when none archived", () => {
      const usage = calculateMeteredUsage(10, 0);
      expect(usage.billableUnits).toBe(10);
      expect(usage.netActive).toBe(10);
    });

    it("should bill for created even when all archived in same period", () => {
      const usage = calculateMeteredUsage(3, 3);
      expect(usage.billableUnits).toBe(3);
      expect(usage.netActive).toBe(0);
    });

    it("should handle zero usage", () => {
      const usage = calculateMeteredUsage(0, 0);
      expect(usage.billableUnits).toBe(0);
      expect(usage.netActive).toBe(0);
    });

    it("should handle single assessment created and archived", () => {
      const usage = calculateMeteredUsage(1, 1);
      expect(usage.billableUnits).toBe(1);
      expect(usage.netActive).toBe(0);
    });

    it("should handle large volume — 1000 created, 500 archived", () => {
      const usage = calculateMeteredUsage(1000, 500);
      expect(usage.billableUnits).toBe(1000);
      expect(usage.netActive).toBe(500);
    });
  });

  // -----------------------------------------------------------------------
  // Structural integrity
  // -----------------------------------------------------------------------
  describe("state machine structural integrity", () => {
    it("should have exactly 6 states", () => {
      expect(ALL_STATES).toHaveLength(6);
    });

    it("every target in the transition map should be a known state", () => {
      for (const from of ALL_STATES) {
        for (const to of VALID_TRANSITIONS[from]) {
          expect(ALL_STATES).toContain(to);
        }
      }
    });

    it("TRIALING should be the initial state with 3 outbound transitions", () => {
      expect(VALID_TRANSITIONS.TRIALING).toHaveLength(3);
    });

    it("self-transitions should be rejected for every state", () => {
      for (const state of ALL_STATES) {
        const result = validateTransition(state, state);
        expect(result.allowed).toBe(false);
      }
    });

    it("CANCELED and TRIAL_EXPIRED should only transition to ACTIVE", () => {
      expect(VALID_TRANSITIONS.CANCELED).toEqual(["ACTIVE"]);
      expect(VALID_TRANSITIONS.TRIAL_EXPIRED).toEqual(["ACTIVE"]);
    });

    it("SUSPENDED should be reachable from ACTIVE and PAST_DUE", () => {
      expect(VALID_TRANSITIONS.ACTIVE).toContain("SUSPENDED");
      expect(VALID_TRANSITIONS.PAST_DUE).toContain("SUSPENDED");
    });
  });
});
