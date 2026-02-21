import { describe, it, expect } from "vitest";
import {
  calculateReadinessScorecard,
  type ReadinessInput,
} from "@/lib/report/readiness-calculator";

function makeInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    totalScopeItems: 0,
    decidedScopeItems: 0,
    totalSteps: 0,
    reviewedSteps: 0,
    totalGaps: 0,
    resolvedGaps: 0,
    totalIntegrations: 0,
    analyzedIntegrations: 0,
    totalDmObjects: 0,
    readyDmObjects: 0,
    totalOcmImpacts: 0,
    mitigatedOcmImpacts: 0,
    totalStakeholders: 0,
    activeStakeholders: 0,
    totalSignOffs: 0,
    completedSignOffs: 0,
    ...overrides,
  };
}

function fullInput(): ReadinessInput {
  return {
    totalScopeItems: 50,
    decidedScopeItems: 50,
    totalSteps: 200,
    reviewedSteps: 200,
    totalGaps: 30,
    resolvedGaps: 30,
    totalIntegrations: 10,
    analyzedIntegrations: 10,
    totalDmObjects: 15,
    readyDmObjects: 15,
    totalOcmImpacts: 20,
    mitigatedOcmImpacts: 20,
    totalStakeholders: 8,
    activeStakeholders: 8,
    totalSignOffs: 3,
    completedSignOffs: 3,
  };
}

describe("calculateReadinessScorecard", () => {
  it("returns 100% and go for a fully complete assessment", () => {
    const result = calculateReadinessScorecard(fullInput());
    expect(result.overallScore).toBe(100);
    expect(result.overallStatus).toBe("green");
    expect(result.goNoGo).toBe("go");
    expect(result.categories.every((c) => c.status === "green")).toBe(true);
  });

  it("returns 100% for all-zero totals (nothing to do)", () => {
    const result = calculateReadinessScorecard(makeInput());
    // When total is 0, pct returns 100 (nothing to do = done)
    expect(result.overallScore).toBe(100);
    expect(result.overallStatus).toBe("green");
    expect(result.goNoGo).toBe("go");
  });

  it("returns 0% and no_go when totals exist but nothing done", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 50,
      totalSteps: 200,
      totalGaps: 30,
      totalIntegrations: 10,
      totalDmObjects: 15,
      totalOcmImpacts: 20,
      totalStakeholders: 8,
      totalSignOffs: 3,
    }));
    expect(result.overallScore).toBe(0);
    expect(result.overallStatus).toBe("red");
    expect(result.goNoGo).toBe("no_go");
    expect(result.categories.every((c) => c.status === "red")).toBe(true);
  });

  it("calculates correct category scores for partial completion", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 100,
      decidedScopeItems: 80,
      totalSteps: 200,
      reviewedSteps: 100,
    }));
    const scopeCategory = result.categories.find((c) => c.category === "Scope Decisions");
    expect(scopeCategory?.score).toBe(80);
    expect(scopeCategory?.status).toBe("green");

    const processCategory = result.categories.find((c) => c.category === "Process Review");
    expect(processCategory?.score).toBe(50);
    expect(processCategory?.status).toBe("amber");
  });

  it("returns amber for score of 50", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 100,
      decidedScopeItems: 50,
    }));
    const scopeCategory = result.categories.find((c) => c.category === "Scope Decisions");
    expect(scopeCategory?.score).toBe(50);
    expect(scopeCategory?.status).toBe("amber");
  });

  it("returns red for score of 49", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 100,
      decidedScopeItems: 49,
    }));
    const scopeCategory = result.categories.find((c) => c.category === "Scope Decisions");
    expect(scopeCategory?.score).toBe(49);
    expect(scopeCategory?.status).toBe("red");
  });

  it("returns green for score of 80", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 100,
      decidedScopeItems: 80,
    }));
    const scopeCategory = result.categories.find((c) => c.category === "Scope Decisions");
    expect(scopeCategory?.score).toBe(80);
    expect(scopeCategory?.status).toBe("green");
  });

  it("returns amber for score of 79", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 100,
      decidedScopeItems: 79,
    }));
    const scopeCategory = result.categories.find((c) => c.category === "Scope Decisions");
    expect(scopeCategory?.score).toBe(79);
    expect(scopeCategory?.status).toBe("amber");
  });

  it("returns go when 0 red categories", () => {
    const result = calculateReadinessScorecard(fullInput());
    expect(result.goNoGo).toBe("go");
    expect(result.categories.filter((c) => c.status === "red").length).toBe(0);
  });

  it("returns conditional_go when 1 red category", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 50,
      decidedScopeItems: 50,
      totalSteps: 200,
      reviewedSteps: 200,
      totalGaps: 30,
      resolvedGaps: 30,
      totalIntegrations: 10,
      analyzedIntegrations: 10,
      totalDmObjects: 15,
      readyDmObjects: 15,
      totalOcmImpacts: 20,
      mitigatedOcmImpacts: 20,
      totalStakeholders: 8,
      activeStakeholders: 8,
      // Only sign-offs are red
      totalSignOffs: 3,
      completedSignOffs: 0,
    }));
    expect(result.goNoGo).toBe("conditional_go");
  });

  it("returns conditional_go when 2 red categories", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 50,
      decidedScopeItems: 50,
      totalSteps: 200,
      reviewedSteps: 200,
      totalGaps: 30,
      resolvedGaps: 30,
      totalIntegrations: 10,
      analyzedIntegrations: 10,
      totalDmObjects: 15,
      readyDmObjects: 15,
      totalOcmImpacts: 20,
      mitigatedOcmImpacts: 0, // red
      totalStakeholders: 8,
      activeStakeholders: 8,
      totalSignOffs: 3,
      completedSignOffs: 0, // red
    }));
    expect(result.goNoGo).toBe("conditional_go");
  });

  it("returns no_go when 3+ red categories", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 50,
      decidedScopeItems: 50,
      totalSteps: 200,
      reviewedSteps: 200,
      totalGaps: 30,
      resolvedGaps: 30,
      totalIntegrations: 10,
      analyzedIntegrations: 0, // red
      totalDmObjects: 15,
      readyDmObjects: 0, // red
      totalOcmImpacts: 20,
      mitigatedOcmImpacts: 0, // red
      totalStakeholders: 8,
      activeStakeholders: 8,
      totalSignOffs: 3,
      completedSignOffs: 3,
    }));
    expect(result.goNoGo).toBe("no_go");
  });

  it("has 8 categories", () => {
    const result = calculateReadinessScorecard(fullInput());
    expect(result.categories.length).toBe(8);
  });

  it("generates findings for pending items", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalGaps: 10,
      resolvedGaps: 3,
    }));
    const gapCategory = result.categories.find((c) => c.category === "Gap Resolution");
    expect(gapCategory?.findings.length).toBeGreaterThan(0);
    expect(gapCategory?.findings[0]).toContain("7 of 10");
  });

  it("generates recommendations for red categories", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalIntegrations: 100,
      analyzedIntegrations: 10,
    }));
    const intCategory = result.categories.find((c) => c.category === "Integration Analysis");
    expect(intCategory?.status).toBe("red");
    expect(intCategory?.recommendations.length).toBeGreaterThan(0);
    expect(intCategory?.recommendations[0]).toContain("immediately");
  });

  it("generates recommendations for amber categories", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalSteps: 100,
      reviewedSteps: 60,
    }));
    const cat = result.categories.find((c) => c.category === "Process Review");
    expect(cat?.status).toBe("amber");
    expect(cat?.recommendations.length).toBeGreaterThan(0);
    expect(cat?.recommendations[0]).toContain("Schedule");
  });

  it("generates findings for completed categories", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalStakeholders: 5,
      activeStakeholders: 5,
    }));
    const cat = result.categories.find((c) => c.category === "Stakeholder Engagement");
    expect(cat?.findings.length).toBeGreaterThan(0);
    expect(cat?.findings[0]).toContain("All 5");
  });

  it("generates findings for zero-total categories", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalGaps: 0,
    }));
    const cat = result.categories.find((c) => c.category === "Gap Resolution");
    expect(cat?.findings[0]).toContain("No gaps identified yet");
  });

  it("includes executive summary mentioning overall score", () => {
    const result = calculateReadinessScorecard(fullInput());
    expect(result.executiveSummary).toContain("100%");
    expect(result.executiveSummary).toContain("GO");
  });

  it("overall score is average of all categories", () => {
    const result = calculateReadinessScorecard(makeInput({
      totalScopeItems: 100,
      decidedScopeItems: 100,
      totalSteps: 100,
      reviewedSteps: 0,
    }));
    // Categories: scope=100, steps=0, rest=100 (zero totals)
    // 100+0+100+100+100+100+100+100 = 700 / 8 = 87.5 -> 88
    expect(result.overallScore).toBe(88);
  });
});
