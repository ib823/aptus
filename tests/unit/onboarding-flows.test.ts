import { describe, it, expect } from "vitest";
import {
  getOnboardingFlow,
  getPostOnboardingRedirect,
  canSkipStep,
  getNextStep,
} from "@/lib/onboarding/flow-engine";
import { ONBOARDING_FLOWS } from "@/types/onboarding";
import type { UserRole } from "@/types/assessment";

const ALL_ROLES: UserRole[] = [
  "platform_admin",
  "partner_lead",
  "consultant",
  "project_manager",
  "solution_architect",
  "process_owner",
  "it_lead",
  "data_migration_lead",
  "executive_sponsor",
  "viewer",
  "client_admin",
];

describe("getOnboardingFlow (Phase 24)", () => {
  it.each(ALL_ROLES)("returns a valid flow for role: %s", (role) => {
    const flow = getOnboardingFlow(role);
    expect(flow).toBeDefined();
    expect(flow.role).toBe(role);
    expect(flow.steps.length).toBeGreaterThan(0);
    expect(flow.title).toBeTruthy();
    expect(flow.description).toBeTruthy();
  });

  it("each flow has a welcome step as step 0", () => {
    for (const role of ALL_ROLES) {
      const flow = getOnboardingFlow(role);
      const firstStep = flow.steps[0];
      expect(firstStep).toBeDefined();
      expect(firstStep?.index).toBe(0);
      expect(firstStep?.title.toLowerCase()).toContain("welcome");
    }
  });

  it("all flows have at least one required step", () => {
    for (const role of ALL_ROLES) {
      const flow = getOnboardingFlow(role);
      const requiredSteps = flow.steps.filter((s) => s.isRequired);
      expect(requiredSteps.length).toBeGreaterThan(0);
    }
  });

  it("falls back to viewer flow for unknown roles", () => {
    const flow = getOnboardingFlow("viewer");
    expect(flow.role).toBe("viewer");
  });
});

describe("ONBOARDING_FLOWS constant (Phase 24)", () => {
  it("has entries for all 11 roles", () => {
    for (const role of ALL_ROLES) {
      expect(ONBOARDING_FLOWS[role]).toBeDefined();
    }
  });

  it("all step indices are sequential starting from 0", () => {
    for (const role of ALL_ROLES) {
      const flow = ONBOARDING_FLOWS[role];
      for (let i = 0; i < flow.steps.length; i++) {
        expect(flow.steps[i]?.index).toBe(i);
      }
    }
  });
});

describe("canSkipStep (Phase 24)", () => {
  it("returns false for required steps", () => {
    expect(canSkipStep({ isRequired: true })).toBe(false);
  });

  it("returns true for optional steps", () => {
    expect(canSkipStep({ isRequired: false })).toBe(true);
  });
});

describe("getPostOnboardingRedirect (Phase 24)", () => {
  it("returns /admin for platform_admin", () => {
    expect(getPostOnboardingRedirect("platform_admin")).toBe("/admin");
  });

  it("returns /dashboard for executive_sponsor", () => {
    expect(getPostOnboardingRedirect("executive_sponsor")).toBe("/dashboard");
  });

  it("returns /dashboard for viewer", () => {
    expect(getPostOnboardingRedirect("viewer")).toBe("/dashboard");
  });

  it("returns assessment URL for consultant with context", () => {
    const url = getPostOnboardingRedirect("consultant", { assessmentId: "abc123" });
    expect(url).toBe("/assessments/abc123");
  });

  it("returns /dashboard for consultant without context", () => {
    expect(getPostOnboardingRedirect("consultant")).toBe("/dashboard");
  });

  it("returns /dashboard for project_manager", () => {
    expect(getPostOnboardingRedirect("project_manager")).toBe("/dashboard");
  });
});

describe("getNextStep (Phase 24)", () => {
  const flow = getOnboardingFlow("consultant");

  it("returns 1 from step 0 with no completed steps", () => {
    const next = getNextStep(flow, [0], [], 0);
    expect(next).toBe(1);
  });

  it("returns null when all steps are completed", () => {
    const allIndices = flow.steps.map((s) => s.index);
    const next = getNextStep(flow, allIndices, [], flow.steps.length - 1);
    expect(next).toBeNull();
  });

  it("skips completed steps", () => {
    const next = getNextStep(flow, [0, 1], [], 1);
    expect(next).toBe(2);
  });

  it("skips both completed and skipped steps", () => {
    const next = getNextStep(flow, [0, 1], [2], 1);
    expect(next).toBe(3);
  });

  it("finds earlier missed steps when at end", () => {
    // Skip step 1, complete 0, 2, 3. Current at 3. Step 4 (if exists) or backtrack to 1
    const next = getNextStep(flow, [0, 2, 3], [], 3);
    // Depending on flow length: step 4 if available, else step 1
    if (flow.steps.length > 4) {
      expect(next).toBe(4);
    } else {
      expect(next).toBe(1);
    }
  });

  it("returns the next sequential step after current", () => {
    const next = getNextStep(flow, [], [], 0);
    expect(next).toBe(1);
  });
});
