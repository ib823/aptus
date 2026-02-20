/**
 * Phase 8: Intelligence Layer Admin — Unit Tests
 *
 * Tests admin role checking, CRUD validation schemas,
 * industry profile logic, effort baseline computation,
 * and pattern matching utilities.
 */

import { describe, it, expect } from "vitest";

// ===========================================================================
// Admin Role Guard Tests
// ===========================================================================

type UserRole = "process_owner" | "it_lead" | "executive" | "consultant" | "admin";

function isAdmin(role: UserRole): boolean {
  return role === "admin";
}

describe("Admin Role Guard", () => {
  it("should grant access to admin users", () => {
    expect(isAdmin("admin")).toBe(true);
  });

  it("should deny access to non-admin roles", () => {
    const nonAdminRoles: UserRole[] = ["process_owner", "it_lead", "executive", "consultant"];
    for (const role of nonAdminRoles) {
      expect(isAdmin(role)).toBe(false);
    }
  });
});

// ===========================================================================
// Industry Profile Validation Tests
// ===========================================================================

function validateIndustryCode(code: string): boolean {
  return /^[a-z0-9_-]+$/.test(code) && code.length >= 2 && code.length <= 50;
}

describe("Industry Profile Validation", () => {
  it("should accept valid codes", () => {
    expect(validateIndustryCode("manufacturing")).toBe(true);
    expect(validateIndustryCode("retail-cpg")).toBe(true);
    expect(validateIndustryCode("oil_gas")).toBe(true);
  });

  it("should reject invalid codes", () => {
    expect(validateIndustryCode("")).toBe(false);
    expect(validateIndustryCode("a")).toBe(false);
    expect(validateIndustryCode("Has Spaces")).toBe(false);
    expect(validateIndustryCode("UPPERCASE")).toBe(false);
    expect(validateIndustryCode("special!chars")).toBe(false);
  });

  it("should handle scope item assignment", () => {
    const profile = {
      code: "manufacturing",
      name: "Manufacturing",
      applicableScopeItems: ["J60", "J61", "J62"],
      typicalScopeCount: 85,
    };
    expect(profile.applicableScopeItems).toHaveLength(3);
    expect(profile.typicalScopeCount).toBe(85);
  });
});

// ===========================================================================
// Effort Baseline Computation Tests
// ===========================================================================

interface EffortBaseline {
  scopeItemId: string;
  complexity: "low" | "medium" | "high";
  implementationDays: number;
  configDays: number;
  testDays: number;
  dataMigrationDays: number;
  trainingDays: number;
  confidence: number;
}

function computeTotalEffort(baseline: EffortBaseline): number {
  return (
    baseline.implementationDays +
    baseline.configDays +
    baseline.testDays +
    baseline.dataMigrationDays +
    baseline.trainingDays
  );
}

function aggregateEffort(baselines: EffortBaseline[]): {
  totalDays: number;
  byPhase: Record<string, number>;
  averageConfidence: number;
} {
  const totalDays = baselines.reduce((sum, b) => sum + computeTotalEffort(b), 0);
  const byPhase: Record<string, number> = {
    implementation: baselines.reduce((sum, b) => sum + b.implementationDays, 0),
    config: baselines.reduce((sum, b) => sum + b.configDays, 0),
    test: baselines.reduce((sum, b) => sum + b.testDays, 0),
    dataMigration: baselines.reduce((sum, b) => sum + b.dataMigrationDays, 0),
    training: baselines.reduce((sum, b) => sum + b.trainingDays, 0),
  };
  const averageConfidence =
    baselines.length > 0
      ? baselines.reduce((sum, b) => sum + b.confidence, 0) / baselines.length
      : 0;

  return { totalDays, byPhase, averageConfidence };
}

const makeBaseline = (overrides: Partial<EffortBaseline> = {}): EffortBaseline => ({
  scopeItemId: overrides.scopeItemId ?? "J60",
  complexity: overrides.complexity ?? "medium",
  implementationDays: overrides.implementationDays ?? 5,
  configDays: overrides.configDays ?? 3,
  testDays: overrides.testDays ?? 2,
  dataMigrationDays: overrides.dataMigrationDays ?? 1,
  trainingDays: overrides.trainingDays ?? 0.5,
  confidence: overrides.confidence ?? 0.8,
});

describe("Effort Baseline Computation", () => {
  it("should compute total effort for single baseline", () => {
    const baseline = makeBaseline({
      implementationDays: 5,
      configDays: 3,
      testDays: 2,
      dataMigrationDays: 1,
      trainingDays: 0.5,
    });
    expect(computeTotalEffort(baseline)).toBe(11.5);
  });

  it("should aggregate effort across multiple baselines", () => {
    const baselines = [
      makeBaseline({ implementationDays: 5, configDays: 3, testDays: 2, dataMigrationDays: 1, trainingDays: 0.5, confidence: 0.8 }),
      makeBaseline({ scopeItemId: "J61", implementationDays: 10, configDays: 5, testDays: 3, dataMigrationDays: 2, trainingDays: 1, confidence: 0.6 }),
    ];
    const result = aggregateEffort(baselines);
    expect(result.totalDays).toBe(32.5);
    expect(result.byPhase["implementation"]).toBe(15);
    expect(result.byPhase["config"]).toBe(8);
    expect(result.averageConfidence).toBe(0.7);
  });

  it("should handle empty baselines", () => {
    const result = aggregateEffort([]);
    expect(result.totalDays).toBe(0);
    expect(result.averageConfidence).toBe(0);
  });

  it("should validate confidence range", () => {
    expect(makeBaseline({ confidence: 0 }).confidence).toBe(0);
    expect(makeBaseline({ confidence: 1 }).confidence).toBe(1);
    expect(makeBaseline({ confidence: 0.5 }).confidence).toBe(0.5);
  });
});

// ===========================================================================
// Extensibility Pattern Tests
// ===========================================================================

const RESOLUTION_TYPES = ["KEY_USER", "BTP", "ISV", "CUSTOM_ABAP", "NOT_POSSIBLE"] as const;
const RISK_LEVELS = ["low", "medium", "high"] as const;

interface ExtensibilityPattern {
  resolutionType: string;
  effortDays: number;
  riskLevel: string;
  sapSupported: boolean;
  upgradeSafe: boolean;
}

function sortPatternsByRisk(patterns: ExtensibilityPattern[]): ExtensibilityPattern[] {
  const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };
  return [...patterns].sort(
    (a, b) => (riskOrder[a.riskLevel] ?? 0) - (riskOrder[b.riskLevel] ?? 0),
  );
}

function filterUpgradeSafe(patterns: ExtensibilityPattern[]): ExtensibilityPattern[] {
  return patterns.filter((p) => p.upgradeSafe);
}

describe("Extensibility Pattern Logic", () => {
  it("should recognize all resolution types", () => {
    expect(RESOLUTION_TYPES).toHaveLength(5);
    expect(RESOLUTION_TYPES).toContain("KEY_USER");
    expect(RESOLUTION_TYPES).toContain("BTP");
    expect(RESOLUTION_TYPES).toContain("NOT_POSSIBLE");
  });

  it("should sort patterns by risk level", () => {
    const patterns: ExtensibilityPattern[] = [
      { resolutionType: "CUSTOM_ABAP", effortDays: 20, riskLevel: "high", sapSupported: false, upgradeSafe: false },
      { resolutionType: "KEY_USER", effortDays: 2, riskLevel: "low", sapSupported: true, upgradeSafe: true },
      { resolutionType: "BTP", effortDays: 10, riskLevel: "medium", sapSupported: true, upgradeSafe: true },
    ];
    const sorted = sortPatternsByRisk(patterns);
    expect(sorted[0]?.riskLevel).toBe("low");
    expect(sorted[1]?.riskLevel).toBe("medium");
    expect(sorted[2]?.riskLevel).toBe("high");
  });

  it("should filter upgrade-safe patterns", () => {
    const patterns: ExtensibilityPattern[] = [
      { resolutionType: "KEY_USER", effortDays: 2, riskLevel: "low", sapSupported: true, upgradeSafe: true },
      { resolutionType: "CUSTOM_ABAP", effortDays: 20, riskLevel: "high", sapSupported: false, upgradeSafe: false },
      { resolutionType: "BTP", effortDays: 10, riskLevel: "medium", sapSupported: true, upgradeSafe: true },
    ];
    const safe = filterUpgradeSafe(patterns);
    expect(safe).toHaveLength(2);
    expect(safe.every((p) => p.upgradeSafe)).toBe(true);
  });

  it("should validate risk levels", () => {
    expect(RISK_LEVELS).toHaveLength(3);
    expect(RISK_LEVELS).toContain("low");
    expect(RISK_LEVELS).toContain("medium");
    expect(RISK_LEVELS).toContain("high");
  });
});

// ===========================================================================
// Adaptation Pattern Tests
// ===========================================================================

interface AdaptationPattern {
  recommendation: "ADAPT" | "EXTEND";
  adaptEffort: string;
  extendEffort: string;
}

function getRecommendation(pattern: AdaptationPattern): string {
  return pattern.recommendation === "ADAPT"
    ? `Recommend adapting business process (effort: ${pattern.adaptEffort})`
    : `Recommend extending SAP (effort: ${pattern.extendEffort})`;
}

describe("Adaptation Pattern Logic", () => {
  it("should generate ADAPT recommendation", () => {
    const pattern: AdaptationPattern = {
      recommendation: "ADAPT",
      adaptEffort: "2-3 days training",
      extendEffort: "15 days development",
    };
    const rec = getRecommendation(pattern);
    expect(rec).toContain("adapting");
    expect(rec).toContain("2-3 days");
  });

  it("should generate EXTEND recommendation", () => {
    const pattern: AdaptationPattern = {
      recommendation: "EXTEND",
      adaptEffort: "not feasible",
      extendEffort: "10 days BTP",
    };
    const rec = getRecommendation(pattern);
    expect(rec).toContain("extending");
    expect(rec).toContain("10 days");
  });
});

// ===========================================================================
// Admin Dashboard Summary Tests
// ===========================================================================

interface AdminStats {
  assessments: { total: number; active: number; signedOff: number };
  catalog: { scopeItems: number; processSteps: number; configActivities: number };
  intelligence: { industries: number; baselines: number; extensibilityPatterns: number; adaptationPatterns: number };
}

function computeAdminHealth(stats: AdminStats): { status: "healthy" | "warning" | "error"; issues: string[] } {
  const issues: string[] = [];
  if (stats.catalog.scopeItems === 0) issues.push("No scope items loaded");
  if (stats.catalog.processSteps === 0) issues.push("No process steps loaded");
  if (stats.catalog.configActivities === 0) issues.push("No config activities loaded");
  if (stats.intelligence.industries === 0) issues.push("No industry profiles configured");

  if (issues.length === 0) return { status: "healthy", issues };
  if (issues.length <= 2) return { status: "warning", issues };
  return { status: "error", issues };
}

describe("Admin Dashboard Health", () => {
  it("should report healthy when all data present", () => {
    const stats: AdminStats = {
      assessments: { total: 5, active: 2, signedOff: 1 },
      catalog: { scopeItems: 550, processSteps: 15000, configActivities: 4700 },
      intelligence: { industries: 3, baselines: 100, extensibilityPatterns: 10, adaptationPatterns: 5 },
    };
    const health = computeAdminHealth(stats);
    expect(health.status).toBe("healthy");
    expect(health.issues).toHaveLength(0);
  });

  it("should warn when some data missing", () => {
    const stats: AdminStats = {
      assessments: { total: 0, active: 0, signedOff: 0 },
      catalog: { scopeItems: 550, processSteps: 15000, configActivities: 4700 },
      intelligence: { industries: 0, baselines: 0, extensibilityPatterns: 0, adaptationPatterns: 0 },
    };
    const health = computeAdminHealth(stats);
    expect(health.status).toBe("warning");
    expect(health.issues).toContain("No industry profiles configured");
  });

  it("should error when critical data missing", () => {
    const stats: AdminStats = {
      assessments: { total: 0, active: 0, signedOff: 0 },
      catalog: { scopeItems: 0, processSteps: 0, configActivities: 0 },
      intelligence: { industries: 0, baselines: 0, extensibilityPatterns: 0, adaptationPatterns: 0 },
    };
    const health = computeAdminHealth(stats);
    expect(health.status).toBe("error");
    expect(health.issues.length).toBeGreaterThan(2);
  });
});
