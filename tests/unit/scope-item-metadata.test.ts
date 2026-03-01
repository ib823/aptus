import { describe, it, expect } from "vitest";
import {
  SCOPE_ITEM_METADATA,
  getScopeItemMetadata,
  getActivityMetadata,
  getModulesForScopeItem,
  getDependenciesForScopeItem,
} from "@/constants/scope-item-metadata";

describe("SCOPE_ITEM_METADATA", () => {
  it("contains all 6 expected scope items", () => {
    const ids = Object.keys(SCOPE_ITEM_METADATA);
    expect(ids).toContain("J60");
    expect(ids).toContain("J59");
    expect(ids).toContain("J45");
    expect(ids).toContain("1NT");
    expect(ids).toContain("BDW");
    expect(ids).toContain("2ET");
    expect(ids).toHaveLength(6);
  });

  it("each scope item has required fields", () => {
    for (const [id, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      expect(meta.id, `${id} should have matching id`).toBe(id);
      expect(meta.businessName, `${id} should have businessName`).toBeTruthy();
      expect(meta.businessDescription, `${id} should have businessDescription`).toBeTruthy();
      expect(meta.modules, `${id} should have modules array`).toBeInstanceOf(Array);
      expect(meta.modules.length, `${id} should have at least one module`).toBeGreaterThan(0);
      expect(meta.masterData, `${id} should have masterData array`).toBeInstanceOf(Array);
      expect(meta.dependencies, `${id} should have dependencies array`).toBeInstanceOf(Array);
      expect(meta.activityMetadata, `${id} should have activityMetadata array`).toBeInstanceOf(Array);
      expect(meta.activityMetadata.length, `${id} should have at least one activity`).toBeGreaterThan(0);
      expect(meta.defaultImplications, `${id} should have defaultImplications`).toBeTruthy();
    }
  });

  it("each activity metadata has required fields", () => {
    for (const [id, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      for (const act of meta.activityMetadata) {
        expect(act.activityTitlePattern, `${id} activity should have titlePattern`).toBeTruthy();
        expect(act.businessQuestion, `${id} activity should have businessQuestion`).toBeTruthy();
        expect(act.thinkAbout, `${id} activity should have thinkAbout`).toBeTruthy();
        expect(act.modules, `${id} activity should have modules`).toBeInstanceOf(Array);
        expect(act.configAreas, `${id} activity should have configAreas`).toBeInstanceOf(Array);
        expect(act.masterDataNeeded, `${id} activity should have masterDataNeeded`).toBeInstanceOf(Array);
        expect(["low", "medium", "high"]).toContain(act.effortCategory);
      }
    }
  });

  it("each module has code and name", () => {
    for (const [id, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      for (const mod of meta.modules) {
        expect(mod.code, `${id} module should have code`).toBeTruthy();
        expect(mod.name, `${id} module should have name`).toBeTruthy();
      }
    }
  });

  it("each dependency has required fields and valid type", () => {
    for (const [id, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      for (const dep of meta.dependencies) {
        expect(dep.scopeItemId, `${id} dependency should have scopeItemId`).toBeTruthy();
        expect(dep.name, `${id} dependency should have name`).toBeTruthy();
        expect(dep.reason, `${id} dependency should have reason`).toBeTruthy();
        expect(["required", "recommended", "optional"]).toContain(dep.type);
      }
    }
  });

  it("defaultImplications has all status descriptions", () => {
    for (const [id, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
      const impl = meta.defaultImplications;
      expect(impl.fitDescription, `${id} should have fitDescription`).toBeTruthy();
      expect(impl.configureDescription, `${id} should have configureDescription`).toBeTruthy();
      expect(impl.gapDescription, `${id} should have gapDescription`).toBeTruthy();
      expect(impl.naDescription, `${id} should have naDescription`).toBeTruthy();
      expect(impl.naImpact, `${id} should have naImpact`).toBeTruthy();
    }
  });
});

describe("getScopeItemMetadata", () => {
  it("returns metadata for known scope item", () => {
    const meta = getScopeItemMetadata("J60");
    expect(meta).not.toBeNull();
    expect(meta?.id).toBe("J60");
    expect(meta?.businessName).toBe("Accounts Payable");
  });

  it("returns null for unknown scope item", () => {
    expect(getScopeItemMetadata("UNKNOWN")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getScopeItemMetadata("")).toBeNull();
  });
});

describe("getActivityMetadata", () => {
  it("matches activity by exact title pattern", () => {
    // J60 has an activity with pattern containing "Invoice"
    const meta = getActivityMetadata("J60", "Invoice Processing");
    // Should find something related to invoices
    expect(meta).not.toBeNull();
    expect(meta?.businessQuestion).toBeTruthy();
  });

  it("matches case-insensitively", () => {
    const meta = getActivityMetadata("J60", "invoice processing");
    expect(meta).not.toBeNull();
  });

  it("returns null for unknown scope item", () => {
    expect(getActivityMetadata("UNKNOWN", "some activity")).toBeNull();
  });

  it("returns null for unmatched activity title", () => {
    expect(getActivityMetadata("J60", "Completely Unrelated Title XYZ999")).toBeNull();
  });
});

describe("getModulesForScopeItem", () => {
  it("returns modules for known scope item", () => {
    const modules = getModulesForScopeItem("J60");
    expect(modules.length).toBeGreaterThan(0);
    expect(modules[0]?.code).toBeTruthy();
  });

  it("returns empty array for unknown scope item", () => {
    expect(getModulesForScopeItem("UNKNOWN")).toEqual([]);
  });
});

describe("getDependenciesForScopeItem", () => {
  it("returns dependencies for known scope item", () => {
    const deps = getDependenciesForScopeItem("J60");
    expect(deps.length).toBeGreaterThan(0);
    expect(deps[0]?.scopeItemId).toBeTruthy();
  });

  it("returns empty array for unknown scope item", () => {
    expect(getDependenciesForScopeItem("UNKNOWN")).toEqual([]);
  });
});
