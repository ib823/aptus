/**
 * Config Matrix — Unit Tests
 *
 * Tests config filtering, inclusion defaults, exclusion validation,
 * summary computation, and scope item grouping logic.
 */

import { describe, it, expect } from "vitest";

// ---------- helpers ---------

interface ConfigItem {
  id: string;
  scopeItemId: string;
  scopeItemName: string;
  configItemName: string;
  activityDescription: string;
  category: string;
  selfService: boolean;
  applicationArea: string;
  applicationSubarea: string;
  included: boolean;
  excludeReason: string | null;
}

function makeConfig(overrides: Partial<ConfigItem> = {}): ConfigItem {
  return {
    id: overrides.id ?? `cfg-${Math.random().toString(36).slice(2, 8)}`,
    scopeItemId: overrides.scopeItemId ?? "J60",
    scopeItemName: overrides.scopeItemName ?? "Accounts Payable",
    configItemName: overrides.configItemName ?? "Define Accounting Principles",
    activityDescription: overrides.activityDescription ?? "Configure accounting principles for AP",
    category: overrides.category ?? "Mandatory",
    selfService: overrides.selfService ?? false,
    applicationArea: overrides.applicationArea ?? "Finance",
    applicationSubarea: overrides.applicationSubarea ?? "Accounts Payable",
    included: overrides.included ?? true,
    excludeReason: overrides.excludeReason ?? null,
  };
}

/** Determines default inclusion based on category */
function defaultIncluded(category: string): boolean {
  return category !== "Optional";
}

/** Filter configs by category set */
function filterByCategories(configs: ConfigItem[], categories: Set<string>): ConfigItem[] {
  if (categories.size === 0) return configs;
  return configs.filter((c) => categories.has(c.category));
}

/** Filter configs by search query */
function filterBySearch(configs: ConfigItem[], query: string): ConfigItem[] {
  if (!query.trim()) return configs;
  const q = query.toLowerCase();
  return configs.filter(
    (c) =>
      c.configItemName.toLowerCase().includes(q) ||
      c.activityDescription.toLowerCase().includes(q) ||
      c.scopeItemName.toLowerCase().includes(q) ||
      c.scopeItemId.toLowerCase().includes(q),
  );
}

/** Filter self-service only */
function filterSelfService(configs: ConfigItem[], selfServiceOnly: boolean): ConfigItem[] {
  return selfServiceOnly ? configs.filter((c) => c.selfService) : configs;
}

/** Filter by scope item */
function filterByScopeItem(configs: ConfigItem[], scopeItemId: string): ConfigItem[] {
  return scopeItemId ? configs.filter((c) => c.scopeItemId === scopeItemId) : configs;
}

/** Compute summary stats */
function computeSummary(configs: ConfigItem[]) {
  const mandatory = configs.filter((c) => c.category === "Mandatory").length;
  const recommended = configs.filter((c) => c.category === "Recommended").length;
  const optional = configs.filter((c) => c.category === "Optional").length;
  const selfService = configs.filter((c) => c.selfService).length;
  const includedCount = configs.filter((c) => c.included).length;
  const excludedRecommended = configs.filter((c) => c.category === "Recommended" && !c.included).length;
  const includedOptional = configs.filter((c) => c.category === "Optional" && c.included).length;
  return { mandatory, recommended, optional, total: configs.length, selfService, includedCount, excludedRecommended, includedOptional };
}

/** Validate exclusion reason for Recommended configs */
function validateExclusionReason(category: string, included: boolean, reason: string | undefined): string | null {
  if (included) return null;
  if (category === "Mandatory") return "Mandatory configs cannot be excluded";
  if (category === "Recommended" && (!reason || reason.trim().length < 10)) {
    return "Reason required (min 10 chars) when excluding a recommended config";
  }
  return null;
}

/** Group configs by scope item */
function groupByScopeItem(configs: ConfigItem[]): Map<string, ConfigItem[]> {
  const map = new Map<string, ConfigItem[]>();
  for (const c of configs) {
    const group = map.get(c.scopeItemId) ?? [];
    group.push(c);
    map.set(c.scopeItemId, group);
  }
  return map;
}

// ---------- tests -----------

describe("Config Matrix — Default Inclusion", () => {
  it("mandatory configs default to included", () => {
    expect(defaultIncluded("Mandatory")).toBe(true);
  });

  it("recommended configs default to included", () => {
    expect(defaultIncluded("Recommended")).toBe(true);
  });

  it("optional configs default to excluded", () => {
    expect(defaultIncluded("Optional")).toBe(false);
  });
});

describe("Config Matrix — Category Filtering", () => {
  const configs = [
    makeConfig({ category: "Mandatory" }),
    makeConfig({ category: "Recommended" }),
    makeConfig({ category: "Optional", included: false }),
    makeConfig({ category: "Mandatory" }),
  ];

  it("filters by single category", () => {
    const result = filterByCategories(configs, new Set(["Mandatory"]));
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.category === "Mandatory")).toBe(true);
  });

  it("filters by multiple categories", () => {
    const result = filterByCategories(configs, new Set(["Mandatory", "Recommended"]));
    expect(result).toHaveLength(3);
  });

  it("empty set returns all configs", () => {
    const result = filterByCategories(configs, new Set());
    expect(result).toHaveLength(4);
  });
});

describe("Config Matrix — Search Filtering", () => {
  const configs = [
    makeConfig({ configItemName: "Define Accounting Principles", scopeItemId: "J60", scopeItemName: "Accounts Payable", activityDescription: "Set up AP rules" }),
    makeConfig({ configItemName: "Set Up Bank Accounts", scopeItemId: "1YB", scopeItemName: "Banking", activityDescription: "Configure bank master data" }),
    makeConfig({ configItemName: "Purchase Order Setup", scopeItemId: "2QS", scopeItemName: "Procurement", activityDescription: "Define PO workflow" }),
  ];

  it("searches by config item name", () => {
    const result = filterBySearch(configs, "accounting");
    expect(result).toHaveLength(1);
    expect(result[0]?.configItemName).toBe("Define Accounting Principles");
  });

  it("searches by activity description", () => {
    const result = filterBySearch(configs, "bank master");
    expect(result).toHaveLength(1);
  });

  it("searches by scope item ID", () => {
    const result = filterBySearch(configs, "J60");
    expect(result).toHaveLength(1);
  });

  it("searches by scope item name", () => {
    const result = filterBySearch(configs, "procurement");
    expect(result).toHaveLength(1);
  });

  it("empty query returns all", () => {
    const result = filterBySearch(configs, "");
    expect(result).toHaveLength(3);
  });
});

describe("Config Matrix — Self-Service Filter", () => {
  const configs = [
    makeConfig({ selfService: true }),
    makeConfig({ selfService: false }),
    makeConfig({ selfService: true }),
  ];

  it("filters self-service only", () => {
    const result = filterSelfService(configs, true);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.selfService)).toBe(true);
  });

  it("disabled filter returns all", () => {
    const result = filterSelfService(configs, false);
    expect(result).toHaveLength(3);
  });
});

describe("Config Matrix — Scope Item Filtering", () => {
  const configs = [
    makeConfig({ scopeItemId: "J60" }),
    makeConfig({ scopeItemId: "J60" }),
    makeConfig({ scopeItemId: "1YB" }),
  ];

  it("filters by scope item ID", () => {
    const result = filterByScopeItem(configs, "J60");
    expect(result).toHaveLength(2);
  });

  it("empty scope item returns all", () => {
    const result = filterByScopeItem(configs, "");
    expect(result).toHaveLength(3);
  });
});

describe("Config Matrix — Exclusion Validation", () => {
  it("mandatory configs cannot be excluded", () => {
    const error = validateExclusionReason("Mandatory", false, "some reason");
    expect(error).toBe("Mandatory configs cannot be excluded");
  });

  it("recommended configs require reason when excluded", () => {
    const error = validateExclusionReason("Recommended", false, undefined);
    expect(error).toContain("Reason required");
  });

  it("recommended configs require min 10 char reason", () => {
    const error = validateExclusionReason("Recommended", false, "short");
    expect(error).toContain("Reason required");
  });

  it("recommended configs accept valid reason", () => {
    const error = validateExclusionReason("Recommended", false, "This config is not needed because of custom process");
    expect(error).toBeNull();
  });

  it("optional configs can be excluded without reason", () => {
    const error = validateExclusionReason("Optional", false, undefined);
    expect(error).toBeNull();
  });

  it("inclusion never requires reason", () => {
    const error = validateExclusionReason("Recommended", true, undefined);
    expect(error).toBeNull();
  });
});

describe("Config Matrix — Summary Computation", () => {
  const configs = [
    makeConfig({ category: "Mandatory", selfService: true, included: true }),
    makeConfig({ category: "Mandatory", selfService: false, included: true }),
    makeConfig({ category: "Recommended", selfService: true, included: true }),
    makeConfig({ category: "Recommended", selfService: false, included: false, excludeReason: "Not needed for our setup" }),
    makeConfig({ category: "Optional", selfService: true, included: false }),
    makeConfig({ category: "Optional", selfService: false, included: true }),
  ];

  it("counts categories correctly", () => {
    const summary = computeSummary(configs);
    expect(summary.mandatory).toBe(2);
    expect(summary.recommended).toBe(2);
    expect(summary.optional).toBe(2);
    expect(summary.total).toBe(6);
  });

  it("counts self-service correctly", () => {
    const summary = computeSummary(configs);
    expect(summary.selfService).toBe(3);
  });

  it("counts included configs", () => {
    const summary = computeSummary(configs);
    expect(summary.includedCount).toBe(4);
  });

  it("counts excluded recommended", () => {
    const summary = computeSummary(configs);
    expect(summary.excludedRecommended).toBe(1);
  });

  it("counts included optional", () => {
    const summary = computeSummary(configs);
    expect(summary.includedOptional).toBe(1);
  });
});

describe("Config Matrix — Scope Item Grouping", () => {
  const configs = [
    makeConfig({ scopeItemId: "J60", scopeItemName: "Accounts Payable" }),
    makeConfig({ scopeItemId: "J60", scopeItemName: "Accounts Payable" }),
    makeConfig({ scopeItemId: "1YB", scopeItemName: "Procurement" }),
    makeConfig({ scopeItemId: "2QS", scopeItemName: "Sales Order" }),
    makeConfig({ scopeItemId: "2QS", scopeItemName: "Sales Order" }),
    makeConfig({ scopeItemId: "2QS", scopeItemName: "Sales Order" }),
  ];

  it("groups configs by scope item", () => {
    const groups = groupByScopeItem(configs);
    expect(groups.size).toBe(3);
    expect(groups.get("J60")?.length).toBe(2);
    expect(groups.get("1YB")?.length).toBe(1);
    expect(groups.get("2QS")?.length).toBe(3);
  });
});

describe("Config Matrix — Combined Filters", () => {
  const configs = [
    makeConfig({ category: "Mandatory", selfService: true, scopeItemId: "J60", scopeItemName: "Finance", configItemName: "Ledger Config", activityDescription: "Configure ledger" }),
    makeConfig({ category: "Recommended", selfService: false, scopeItemId: "J60", scopeItemName: "Finance", configItemName: "Tax Setup", activityDescription: "Configure tax rules" }),
    makeConfig({ category: "Optional", selfService: true, scopeItemId: "1YB", scopeItemName: "Procurement", configItemName: "Vendor Portal", activityDescription: "Set up portal", included: false }),
    makeConfig({ category: "Mandatory", selfService: false, scopeItemId: "1YB", scopeItemName: "Procurement", configItemName: "Vendor Master", activityDescription: "Define vendor data" }),
  ];

  it("category + self-service + scope item", () => {
    let result = filterByCategories(configs, new Set(["Mandatory"]));
    result = filterSelfService(result, true);
    result = filterByScopeItem(result, "J60");
    expect(result).toHaveLength(1);
    expect(result[0]?.configItemName).toBe("Ledger Config");
  });

  it("search + category", () => {
    let result = filterByCategories(configs, new Set(["Mandatory", "Recommended"]));
    result = filterBySearch(result, "tax");
    expect(result).toHaveLength(1);
    expect(result[0]?.configItemName).toBe("Tax Setup");
  });
});
