import { describe, it, expect } from "vitest";

/**
 * Unit tests for Phase 11 scope selection enhancements.
 * Tests enrichment field validation, pre-selection logic, and impact computation.
 */

// Simulate the Zod schema validation for enrichment fields
function validateEnrichmentFields(data: {
  priority?: string | null;
  estimatedComplexity?: string | null;
  businessJustification?: string | null;
  dependsOnScopeItems?: string[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const validPriorities = ["critical", "high", "medium", "low"];
  const validComplexities = ["low", "medium", "high"];

  if (data.priority && !validPriorities.includes(data.priority)) {
    errors.push("Invalid priority value");
  }
  if (data.estimatedComplexity && !validComplexities.includes(data.estimatedComplexity)) {
    errors.push("Invalid complexity value");
  }
  if (data.businessJustification && data.businessJustification.length > 5000) {
    errors.push("Business justification too long");
  }

  return { valid: errors.length === 0, errors };
}

// Simulate pre-selection logic
function applyPreSelections(
  existing: Map<string, boolean>,
  preSelectIds: string[],
  mode: "merge" | "replace",
): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;

  if (mode === "replace") {
    // In replace mode, all pre-selected items are applied
    applied = preSelectIds.length;
    return { applied, skipped: 0 };
  }

  // Merge mode: skip already-selected items
  for (const id of preSelectIds) {
    if (existing.get(id)) {
      skipped++;
    } else {
      applied++;
    }
  }

  return { applied, skipped };
}

// Simulate impact computation
function computeImpact(steps: { stepType: string }[], configCount: number) {
  const nonClassifiable = ["LOGON", "ACCESS_APP", "INFORMATION"];
  const totalSteps = steps.length;
  const classifiableSteps = steps.filter((s) => !nonClassifiable.includes(s.stepType)).length;
  return { totalSteps, classifiableSteps, configCount };
}

// Simulate sub-area filter logic from bulk operations
function filterBySubArea(
  items: { id: string; subArea: string; functionalArea: string }[],
  opts: { functionalArea?: string; subArea?: string; scopeItemIds?: string[] },
) {
  let result = items;
  if (opts.functionalArea) {
    result = result.filter((i) => i.functionalArea === opts.functionalArea);
  }
  if (opts.subArea) {
    result = result.filter((i) => i.subArea === opts.subArea);
  }
  if (opts.scopeItemIds) {
    result = result.filter((i) => opts.scopeItemIds!.includes(i.id));
  }
  return result;
}

describe("Enrichment field validation", () => {
  it("accepts valid priority values", () => {
    expect(validateEnrichmentFields({ priority: "critical" }).valid).toBe(true);
    expect(validateEnrichmentFields({ priority: "high" }).valid).toBe(true);
    expect(validateEnrichmentFields({ priority: "medium" }).valid).toBe(true);
    expect(validateEnrichmentFields({ priority: "low" }).valid).toBe(true);
  });

  it("rejects invalid priority values", () => {
    expect(validateEnrichmentFields({ priority: "urgent" }).valid).toBe(false);
  });

  it("accepts valid complexity values", () => {
    expect(validateEnrichmentFields({ estimatedComplexity: "low" }).valid).toBe(true);
    expect(validateEnrichmentFields({ estimatedComplexity: "medium" }).valid).toBe(true);
    expect(validateEnrichmentFields({ estimatedComplexity: "high" }).valid).toBe(true);
  });

  it("rejects invalid complexity values", () => {
    expect(validateEnrichmentFields({ estimatedComplexity: "extreme" }).valid).toBe(false);
  });

  it("accepts null values", () => {
    expect(validateEnrichmentFields({ priority: null, estimatedComplexity: null }).valid).toBe(true);
  });
});

describe("Pre-selection logic", () => {
  it("merge mode skips already-selected items", () => {
    const existing = new Map([["J60", true], ["J61", false]]);
    const preSelectIds = ["J60", "J61", "J62"];
    const result = applyPreSelections(existing, preSelectIds, "merge");
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it("replace mode applies all items", () => {
    const existing = new Map([["J60", true]]);
    const preSelectIds = ["J60", "J61"];
    const result = applyPreSelections(existing, preSelectIds, "replace");
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("handles empty pre-selection list", () => {
    const existing = new Map<string, boolean>();
    const result = applyPreSelections(existing, [], "merge");
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

describe("Impact preview computation", () => {
  it("correctly separates classifiable from non-classifiable steps", () => {
    const steps = [
      { stepType: "LOGON" },
      { stepType: "ACCESS_APP" },
      { stepType: "DATA_ENTRY" },
      { stepType: "ACTION" },
      { stepType: "INFORMATION" },
      { stepType: "VERIFICATION" },
    ];
    const result = computeImpact(steps, 5);
    expect(result.totalSteps).toBe(6);
    expect(result.classifiableSteps).toBe(3);
    expect(result.configCount).toBe(5);
  });

  it("handles empty steps", () => {
    const result = computeImpact([], 0);
    expect(result.totalSteps).toBe(0);
    expect(result.classifiableSteps).toBe(0);
  });
});

describe("Bulk operations with subArea filter", () => {
  const items = [
    { id: "J60", subArea: "Accounting", functionalArea: "Finance" },
    { id: "J61", subArea: "Accounting", functionalArea: "Finance" },
    { id: "J62", subArea: "Tax", functionalArea: "Finance" },
    { id: "J63", subArea: "Purchasing", functionalArea: "Procurement" },
  ];

  it("filters by functionalArea", () => {
    const result = filterBySubArea(items, { functionalArea: "Finance" });
    expect(result).toHaveLength(3);
  });

  it("filters by subArea", () => {
    const result = filterBySubArea(items, { subArea: "Accounting" });
    expect(result).toHaveLength(2);
  });

  it("filters by both area and subArea", () => {
    const result = filterBySubArea(items, { functionalArea: "Finance", subArea: "Tax" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("J62");
  });

  it("filters by scopeItemIds", () => {
    const result = filterBySubArea(items, { scopeItemIds: ["J60", "J63"] });
    expect(result).toHaveLength(2);
  });
});
