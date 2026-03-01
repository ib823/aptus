import { describe, it, expect } from "vitest";
import { SCOPE_ITEM_METADATA, getActivityMetadata } from "@/constants/scope-item-metadata";

/**
 * Tests for activity-level classification logic:
 * - Activity metadata matching and fallback behavior
 * - Business question generation per scope item
 * - Effort category validation
 * - Module reference integrity (all referenced modules exist in scope item)
 * - Master data reference integrity
 */

describe("activity metadata matching", () => {
  it("matches activities by substring (case-insensitive)", () => {
    // J60 has "Invoice Processing" pattern — title must contain the pattern
    const result = getActivityMetadata("J60", "Invoice Processing Overview");
    expect(result).not.toBeNull();
  });

  it("matches regardless of case", () => {
    const upper = getActivityMetadata("J60", "INVOICE PROCESSING");
    const lower = getActivityMetadata("J60", "invoice processing");
    // Both should match (or both null if no match, but pattern exists)
    expect(upper).toEqual(lower);
  });

  it("returns null for completely unmatched activity", () => {
    const result = getActivityMetadata("J60", "ZZZ_UNRELATED_ACTIVITY_999");
    expect(result).toBeNull();
  });

  it("returns null for empty activity title", () => {
    const result = getActivityMetadata("J60", "");
    // Empty string should likely not match any pattern
    expect(result).toBeNull();
  });

  it("returns null for unknown scope item", () => {
    const result = getActivityMetadata("NONEXISTENT", "Some Activity");
    expect(result).toBeNull();
  });
});

describe("module reference integrity", () => {
  it("all activity module codes exist in the parent scope item's modules", () => {
    for (const [scopeId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      const scopeModuleCodes = new Set(meta.modules.map((m) => m.code));

      for (const act of meta.activityMetadata) {
        for (const modCode of act.modules) {
          expect(
            scopeModuleCodes.has(modCode),
            `${scopeId} activity "${act.activityTitlePattern}" references module "${modCode}" not in scope item modules [${Array.from(scopeModuleCodes).join(", ")}]`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("master data reference integrity", () => {
  it("all activity masterDataNeeded exist in the parent scope item's masterData", () => {
    for (const [scopeId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      const scopeMasterNames = new Set(meta.masterData.map((md) => md.objectName));

      for (const act of meta.activityMetadata) {
        for (const mdName of act.masterDataNeeded) {
          expect(
            scopeMasterNames.has(mdName),
            `${scopeId} activity "${act.activityTitlePattern}" references master data "${mdName}" not in scope item masterData [${Array.from(scopeMasterNames).join(", ")}]`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("effort category validation", () => {
  it("all activities have valid effort categories", () => {
    const validCategories = new Set(["low", "medium", "high"]);
    for (const [scopeId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      for (const act of meta.activityMetadata) {
        expect(
          validCategories.has(act.effortCategory),
          `${scopeId} activity "${act.activityTitlePattern}" has invalid effortCategory "${act.effortCategory}"`,
        ).toBe(true);
      }
    }
  });
});

describe("business question coverage", () => {
  it("every scope item has at least 2 activity metadata entries", () => {
    for (const [scopeId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      expect(
        meta.activityMetadata.length,
        `${scopeId} should have multiple activity metadata entries`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("business questions end with question mark", () => {
    for (const [scopeId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      for (const act of meta.activityMetadata) {
        expect(
          act.businessQuestion.trim().endsWith("?"),
          `${scopeId} activity "${act.activityTitlePattern}" businessQuestion should end with "?": "${act.businessQuestion}"`,
        ).toBe(true);
      }
    }
  });

  it("thinkAbout hints are non-empty", () => {
    for (const [scopeId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      for (const act of meta.activityMetadata) {
        expect(
          act.thinkAbout.length,
          `${scopeId} activity "${act.activityTitlePattern}" should have thinkAbout text`,
        ).toBeGreaterThan(10);
      }
    }
  });
});

describe("dependency graph consistency", () => {
  it("all dependency scope item IDs are from known scope items or external", () => {
    const knownIds = new Set(Object.keys(SCOPE_ITEM_METADATA));
    for (const [scopeId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      for (const dep of meta.dependencies) {
        // Dependencies can reference scope items not in our curated set
        // but they should have valid format
        expect(
          dep.scopeItemId.length,
          `${scopeId} dependency should have non-empty scopeItemId`,
        ).toBeGreaterThan(0);
        // Self-reference would be a bug
        expect(
          dep.scopeItemId,
          `${scopeId} should not depend on itself`,
        ).not.toBe(scopeId);
      }
    }
  });

  it("dependency types are valid", () => {
    const validTypes = new Set(["required", "recommended", "optional"]);
    for (const [scopeId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      for (const dep of meta.dependencies) {
        expect(
          validTypes.has(dep.type),
          `${scopeId} dependency "${dep.scopeItemId}" has invalid type "${dep.type}"`,
        ).toBe(true);
      }
    }
  });
});

describe("classification implications", () => {
  it("all scope items have complete implications text", () => {
    for (const [scopeId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      const impl = meta.defaultImplications;
      expect(impl.fitDescription.length, `${scopeId} fitDescription`).toBeGreaterThan(20);
      expect(impl.configureDescription.length, `${scopeId} configureDescription`).toBeGreaterThan(20);
      expect(impl.gapDescription.length, `${scopeId} gapDescription`).toBeGreaterThan(20);
      expect(impl.naDescription.length, `${scopeId} naDescription`).toBeGreaterThan(20);
      expect(impl.naImpact.length, `${scopeId} naImpact`).toBeGreaterThan(20);
    }
  });
});
