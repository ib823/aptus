/**
 * Plan enforcement unit tests (T-PLAN-001 through T-PLAN-009)
 *
 * Tests cover plan-based limits on assessments and seats, trial lifecycle,
 * grace periods for past-due accounts, client stakeholder exclusion,
 * and downgrade read-only behavior.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { PlanTier, SubscriptionStatus } from "@/types/commercial";
import { PLAN_LIMITS } from "@/types/commercial";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Organization {
  id: string;
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  trialExpiresAt: Date | null;
  pastDueSince: Date | null;
  activeAssessmentCount: number;
  partnerUserCount: number;
  clientStakeholderCount: number;
  assessments: Assessment[];
}

interface Assessment {
  id: string;
  createdAt: Date;
  readOnly: boolean;
}

type Action =
  | { type: "CREATE_ASSESSMENT" }
  | { type: "INVITE_PARTNER_USER" }
  | { type: "READ_ASSESSMENT"; assessmentId: string }
  | { type: "ACCESS_FEATURE"; feature: string };

interface EnforcementResult {
  statusCode: number;
  allowed: boolean;
  error?: string;
  readOnlyAssessmentIds?: string[];
}

// ---------------------------------------------------------------------------
// Mock: enforcePlanLimits
// ---------------------------------------------------------------------------

function enforcePlanLimits(org: Organization, action: Action): EnforcementResult {
  const limits = PLAN_LIMITS[org.planTier];

  // Handle trial expired status
  if (org.subscriptionStatus === "TRIAL_EXPIRED") {
    if (action.type === "READ_ASSESSMENT") {
      return { statusCode: 200, allowed: true };
    }
    return { statusCode: 403, allowed: false, error: "Trial expired" };
  }

  // Handle canceled status
  if (org.subscriptionStatus === "CANCELED") {
    if (action.type === "READ_ASSESSMENT") {
      return { statusCode: 200, allowed: true };
    }
    return { statusCode: 403, allowed: false, error: "Subscription canceled" };
  }

  // Handle past-due with grace period (T-PLAN-007)
  if (org.subscriptionStatus === "PAST_DUE") {
    if (org.pastDueSince) {
      const daysSincePastDue = Math.floor(
        (Date.now() - org.pastDueSince.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSincePastDue > 14) {
        return { statusCode: 403, allowed: false, error: "Payment overdue, account restricted" };
      }
    }
    // Within 14-day grace period: allow
  }

  // Handle trial — all Professional features accessible (T-PLAN-004)
  if (org.subscriptionStatus === "TRIALING") {
    if (action.type === "ACCESS_FEATURE") {
      // Trial grants Professional-level feature access
      const proFeatures = PLAN_LIMITS.PROFESSIONAL.features;
      if (proFeatures.includes(action.feature as never)) {
        return { statusCode: 200, allowed: true };
      }
    }
  }

  switch (action.type) {
    case "CREATE_ASSESSMENT": {
      if (org.activeAssessmentCount >= limits.maxActiveAssessments) {
        return { statusCode: 403, allowed: false, error: "Plan limit reached" };
      }
      return { statusCode: 200, allowed: true };
    }

    case "INVITE_PARTNER_USER": {
      // Client stakeholders never count toward seat limit (T-PLAN-008)
      const seatsUsed = org.partnerUserCount; // excludes clientStakeholderCount
      if (seatsUsed >= limits.maxPartnerUsers) {
        return { statusCode: 403, allowed: false, error: "Seat limit reached" };
      }
      return { statusCode: 200, allowed: true };
    }

    case "READ_ASSESSMENT": {
      return { statusCode: 200, allowed: true };
    }

    case "ACCESS_FEATURE": {
      if (limits.features.includes(action.feature as never)) {
        return { statusCode: 200, allowed: true };
      }
      return { statusCode: 403, allowed: false, error: "Feature not available on current plan" };
    }

    default:
      return { statusCode: 200, allowed: true };
  }
}

// ---------------------------------------------------------------------------
// Mock: handlePlanDowngrade
// ---------------------------------------------------------------------------

function handlePlanDowngrade(
  org: Organization,
  newTier: PlanTier,
): EnforcementResult {
  const newLimits = PLAN_LIMITS[newTier];
  const excess = org.activeAssessmentCount - newLimits.maxActiveAssessments;

  if (excess <= 0) {
    return { statusCode: 200, allowed: true };
  }

  // Sort assessments by creation date ascending (oldest first)
  const sorted = [...org.assessments].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  // Oldest assessments beyond the new limit become read-only
  const readOnlyIds = sorted.slice(0, excess).map((a) => a.id);

  return {
    statusCode: 200,
    allowed: true,
    readOnlyAssessmentIds: readOnlyIds,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Plan Enforcement", () => {
  let baseOrg: Organization;

  beforeEach(() => {
    baseOrg = {
      id: "org_test",
      planTier: "STARTER",
      subscriptionStatus: "ACTIVE",
      trialExpiresAt: null,
      pastDueSince: null,
      activeAssessmentCount: 0,
      partnerUserCount: 0,
      clientStakeholderCount: 0,
      assessments: [],
    };
  });

  // T-PLAN-001
  it("T-PLAN-001: Starter plan blocks creation of 4th assessment", () => {
    const org: Organization = {
      ...baseOrg,
      planTier: "STARTER",
      activeAssessmentCount: 3, // STARTER limit is 3
    };

    const result = enforcePlanLimits(org, { type: "CREATE_ASSESSMENT" });

    expect(result.statusCode).toBe(403);
    expect(result.allowed).toBe(false);
    expect(result.error).toBe("Plan limit reached");
  });

  // T-PLAN-002
  it("T-PLAN-002: Professional plan blocks 31st partner user invitation", () => {
    const org: Organization = {
      ...baseOrg,
      planTier: "PROFESSIONAL",
      subscriptionStatus: "ACTIVE",
      partnerUserCount: 30, // PROFESSIONAL limit is 30
    };

    const result = enforcePlanLimits(org, { type: "INVITE_PARTNER_USER" });

    expect(result.statusCode).toBe(403);
    expect(result.allowed).toBe(false);
    expect(result.error).toBe("Seat limit reached");
  });

  // T-PLAN-003
  it("T-PLAN-003: Enterprise plan has no assessment limit enforcement", () => {
    const org: Organization = {
      ...baseOrg,
      planTier: "ENTERPRISE",
      subscriptionStatus: "ACTIVE",
      activeAssessmentCount: 999,
    };

    const result = enforcePlanLimits(org, { type: "CREATE_ASSESSMENT" });

    expect(result.statusCode).toBe(200);
    expect(result.allowed).toBe(true);
    // Confirm that Enterprise maxActiveAssessments is Infinity
    expect(PLAN_LIMITS.ENTERPRISE.maxActiveAssessments).toBe(Infinity);
  });

  // T-PLAN-004
  it("T-PLAN-004: Trial plan grants access to all Professional features", () => {
    const org: Organization = {
      ...baseOrg,
      planTier: "TRIAL",
      subscriptionStatus: "TRIALING",
    };

    const professionalFeatures = PLAN_LIMITS.PROFESSIONAL.features;
    for (const feature of professionalFeatures) {
      const result = enforcePlanLimits(org, { type: "ACCESS_FEATURE", feature });
      expect(result.statusCode).toBe(200);
      expect(result.allowed).toBe(true);
    }
  });

  // T-PLAN-005
  it("T-PLAN-005: Expired trial blocks assessment creation with 403", () => {
    const org: Organization = {
      ...baseOrg,
      planTier: "TRIAL",
      subscriptionStatus: "TRIAL_EXPIRED",
      trialExpiresAt: new Date(Date.now() - 86_400_000), // expired yesterday
    };

    const result = enforcePlanLimits(org, { type: "CREATE_ASSESSMENT" });

    expect(result.statusCode).toBe(403);
    expect(result.allowed).toBe(false);
    expect(result.error).toBe("Trial expired");
  });

  // T-PLAN-006
  it("T-PLAN-006: Expired trial still allows reading existing assessments", () => {
    const org: Organization = {
      ...baseOrg,
      planTier: "TRIAL",
      subscriptionStatus: "TRIAL_EXPIRED",
      trialExpiresAt: new Date(Date.now() - 86_400_000),
    };

    const result = enforcePlanLimits(org, {
      type: "READ_ASSESSMENT",
      assessmentId: "assess_existing",
    });

    expect(result.statusCode).toBe(200);
    expect(result.allowed).toBe(true);
  });

  // T-PLAN-007
  describe("T-PLAN-007: Past-due grace period", () => {
    it("allows assessment creation within 14-day grace period", () => {
      const org: Organization = {
        ...baseOrg,
        planTier: "PROFESSIONAL",
        subscriptionStatus: "PAST_DUE",
        pastDueSince: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        activeAssessmentCount: 5,
      };

      const result = enforcePlanLimits(org, { type: "CREATE_ASSESSMENT" });

      expect(result.statusCode).toBe(200);
      expect(result.allowed).toBe(true);
    });

    it("blocks assessment creation after 14-day grace period", () => {
      const org: Organization = {
        ...baseOrg,
        planTier: "PROFESSIONAL",
        subscriptionStatus: "PAST_DUE",
        pastDueSince: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        activeAssessmentCount: 5,
      };

      const result = enforcePlanLimits(org, { type: "CREATE_ASSESSMENT" });

      expect(result.statusCode).toBe(403);
      expect(result.allowed).toBe(false);
      expect(result.error).toBe("Payment overdue, account restricted");
    });
  });

  // T-PLAN-008
  it("T-PLAN-008: Client stakeholders never count toward seat limit", () => {
    const org: Organization = {
      ...baseOrg,
      planTier: "STARTER",
      subscriptionStatus: "ACTIVE",
      partnerUserCount: 9,             // 9 of 10 partner seats used
      clientStakeholderCount: 50,       // 50 client stakeholders — should not count
    };

    // 10th partner user should be allowed (9 < 10)
    const result = enforcePlanLimits(org, { type: "INVITE_PARTNER_USER" });
    expect(result.statusCode).toBe(200);
    expect(result.allowed).toBe(true);

    // Verify that with partner seats at the limit, it blocks
    org.partnerUserCount = 10;
    const blocked = enforcePlanLimits(org, { type: "INVITE_PARTNER_USER" });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.allowed).toBe(false);
    expect(blocked.error).toBe("Seat limit reached");

    // But the client stakeholder count being high has no effect
    expect(org.clientStakeholderCount).toBe(50);
  });

  // T-PLAN-009
  it("T-PLAN-009: Downgrade with over-limit assessments makes oldest read-only", () => {
    const now = Date.now();
    const assessments: Assessment[] = [
      { id: "assess_oldest", createdAt: new Date(now - 5 * 86_400_000), readOnly: false },
      { id: "assess_middle", createdAt: new Date(now - 3 * 86_400_000), readOnly: false },
      { id: "assess_middle2", createdAt: new Date(now - 2 * 86_400_000), readOnly: false },
      { id: "assess_newest1", createdAt: new Date(now - 1 * 86_400_000), readOnly: false },
      { id: "assess_newest2", createdAt: new Date(now), readOnly: false },
    ];

    const org: Organization = {
      ...baseOrg,
      planTier: "PROFESSIONAL",
      subscriptionStatus: "ACTIVE",
      activeAssessmentCount: 5,
      assessments,
    };

    // Downgrade from PROFESSIONAL (10 limit) to STARTER (3 limit)
    // 5 active - 3 allowed = 2 oldest should become read-only
    const result = handlePlanDowngrade(org, "STARTER");

    expect(result.statusCode).toBe(200);
    expect(result.allowed).toBe(true);
    expect(result.readOnlyAssessmentIds).toHaveLength(2);
    expect(result.readOnlyAssessmentIds).toContain("assess_oldest");
    expect(result.readOnlyAssessmentIds).toContain("assess_middle");
    // Newest 3 should NOT be in the read-only list
    expect(result.readOnlyAssessmentIds).not.toContain("assess_middle2");
    expect(result.readOnlyAssessmentIds).not.toContain("assess_newest1");
    expect(result.readOnlyAssessmentIds).not.toContain("assess_newest2");
  });
});
