import { describe, it, expect } from "vitest";
import {
  hasFeature,
  canTransitionSubscription,
  generateSlug,
  isSubscriptionActive,
  getReadOnlyStatuses,
  getPlanLimits,
} from "@/lib/commercial/plan-engine";
import type { PlanFeature, SubscriptionStatus } from "@/types/commercial";

describe("hasFeature", () => {
  it("TRIAL includes core_assessment", () => {
    expect(hasFeature("TRIAL", "core_assessment")).toBe(true);
  });

  it("TRIAL does not include standard_reports", () => {
    expect(hasFeature("TRIAL", "standard_reports")).toBe(false);
  });

  it("STARTER includes core_assessment and standard_reports", () => {
    expect(hasFeature("STARTER", "core_assessment")).toBe(true);
    expect(hasFeature("STARTER", "standard_reports")).toBe(true);
  });

  it("STARTER does not include registers", () => {
    expect(hasFeature("STARTER", "registers")).toBe(false);
  });

  it("PROFESSIONAL includes workshop_mode and analytics", () => {
    expect(hasFeature("PROFESSIONAL", "workshop_mode")).toBe(true);
    expect(hasFeature("PROFESSIONAL", "analytics")).toBe(true);
  });

  it("PROFESSIONAL does not include sso_scim", () => {
    expect(hasFeature("PROFESSIONAL", "sso_scim")).toBe(false);
  });

  it("ENTERPRISE includes all features", () => {
    const allFeatures: PlanFeature[] = [
      "core_assessment", "standard_reports", "registers",
      "workshop_mode", "analytics", "sso_scim",
      "custom_branding", "api_access", "audit_export", "dedicated_csm",
    ];
    for (const feature of allFeatures) {
      expect(hasFeature("ENTERPRISE", feature)).toBe(true);
    }
  });
});

describe("canTransitionSubscription", () => {
  it("allows TRIALING -> ACTIVE", () => {
    expect(canTransitionSubscription("TRIALING", "ACTIVE")).toBe(true);
  });

  it("allows TRIALING -> TRIAL_EXPIRED", () => {
    expect(canTransitionSubscription("TRIALING", "TRIAL_EXPIRED")).toBe(true);
  });

  it("blocks TRIALING -> CANCELED", () => {
    expect(canTransitionSubscription("TRIALING", "CANCELED")).toBe(false);
  });

  it("allows ACTIVE -> PAST_DUE", () => {
    expect(canTransitionSubscription("ACTIVE", "PAST_DUE")).toBe(true);
  });

  it("allows ACTIVE -> CANCELED", () => {
    expect(canTransitionSubscription("ACTIVE", "CANCELED")).toBe(true);
  });

  it("blocks ACTIVE -> TRIALING", () => {
    expect(canTransitionSubscription("ACTIVE", "TRIALING")).toBe(false);
  });

  it("allows PAST_DUE -> ACTIVE", () => {
    expect(canTransitionSubscription("PAST_DUE", "ACTIVE")).toBe(true);
  });

  it("allows PAST_DUE -> CANCELED", () => {
    expect(canTransitionSubscription("PAST_DUE", "CANCELED")).toBe(true);
  });

  it("blocks CANCELED -> anything", () => {
    const allStatuses: SubscriptionStatus[] = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "TRIAL_EXPIRED"];
    for (const s of allStatuses) {
      expect(canTransitionSubscription("CANCELED", s)).toBe(false);
    }
  });

  it("allows TRIAL_EXPIRED -> ACTIVE", () => {
    expect(canTransitionSubscription("TRIAL_EXPIRED", "ACTIVE")).toBe(true);
  });

  it("blocks TRIAL_EXPIRED -> TRIALING", () => {
    expect(canTransitionSubscription("TRIAL_EXPIRED", "TRIALING")).toBe(false);
  });
});

describe("generateSlug", () => {
  it("converts to lowercase", () => {
    expect(generateSlug("ACME Corp")).toBe("acme-corp");
  });

  it("replaces spaces with hyphens", () => {
    expect(generateSlug("My Company")).toBe("my-company");
  });

  it("replaces special characters with hyphens", () => {
    expect(generateSlug("Company & Co. Ltd.")).toBe("company-co-ltd");
  });

  it("trims leading/trailing hyphens", () => {
    expect(generateSlug("  --Company--  ")).toBe("company");
  });

  it("truncates to 50 characters", () => {
    const long = "A".repeat(100);
    expect(generateSlug(long).length).toBeLessThanOrEqual(50);
  });

  it("handles empty string", () => {
    expect(generateSlug("")).toBe("");
  });

  it("collapses multiple non-alphanumeric chars into single hyphen", () => {
    expect(generateSlug("hello   world---test")).toBe("hello-world-test");
  });

  it("handles unicode characters", () => {
    expect(generateSlug("Compagnie Française")).toBe("compagnie-fran-aise");
  });
});

describe("isSubscriptionActive", () => {
  it("returns true for TRIALING", () => {
    expect(isSubscriptionActive("TRIALING")).toBe(true);
  });

  it("returns true for ACTIVE", () => {
    expect(isSubscriptionActive("ACTIVE")).toBe(true);
  });

  it("returns false for PAST_DUE", () => {
    expect(isSubscriptionActive("PAST_DUE")).toBe(false);
  });

  it("returns false for CANCELED", () => {
    expect(isSubscriptionActive("CANCELED")).toBe(false);
  });

  it("returns false for TRIAL_EXPIRED", () => {
    expect(isSubscriptionActive("TRIAL_EXPIRED")).toBe(false);
  });
});

describe("getReadOnlyStatuses", () => {
  it("returns TRIAL_EXPIRED and CANCELED", () => {
    const statuses = getReadOnlyStatuses();
    expect(statuses).toContain("TRIAL_EXPIRED");
    expect(statuses).toContain("CANCELED");
    expect(statuses.length).toBe(2);
  });
});

describe("getPlanLimits", () => {
  it("returns correct limits for TRIAL", () => {
    const limits = getPlanLimits("TRIAL");
    expect(limits.maxActiveAssessments).toBe(1);
    expect(limits.maxPartnerUsers).toBe(5);
    expect(limits.features).toContain("core_assessment");
    expect(limits.features.length).toBe(1);
  });

  it("returns correct limits for STARTER", () => {
    const limits = getPlanLimits("STARTER");
    expect(limits.maxActiveAssessments).toBe(3);
    expect(limits.maxPartnerUsers).toBe(10);
    expect(limits.features).toContain("standard_reports");
  });

  it("returns correct limits for PROFESSIONAL", () => {
    const limits = getPlanLimits("PROFESSIONAL");
    expect(limits.maxActiveAssessments).toBe(10);
    expect(limits.maxPartnerUsers).toBe(30);
    expect(limits.features.length).toBe(5);
  });

  it("returns correct limits for ENTERPRISE", () => {
    const limits = getPlanLimits("ENTERPRISE");
    expect(limits.maxActiveAssessments).toBe(Infinity);
    expect(limits.maxPartnerUsers).toBe(Infinity);
    expect(limits.features.length).toBe(10);
  });
});
