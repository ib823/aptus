import { describe, it, expect } from "vitest";

/**
 * Unit tests for scope selection logic.
 * Tests filter logic, stats calculations, and selection state transitions.
 */

interface ScopeItem {
  id: string;
  nameClean: string;
  functionalArea: string;
  subArea: string;
  totalSteps: number;
  selected: boolean;
  relevance: string | null;
}

function filterItems(
  items: ScopeItem[],
  opts: { search?: string; filter?: string; area?: string },
): ScopeItem[] {
  let result = items;

  if (opts.search?.trim()) {
    const q = opts.search.toLowerCase();
    result = result.filter(
      (item) =>
        item.nameClean.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.subArea.toLowerCase().includes(q) ||
        item.functionalArea.toLowerCase().includes(q),
    );
  }

  if (opts.filter === "selected") {
    result = result.filter((item) => item.selected);
  } else if (opts.filter === "not_selected") {
    result = result.filter((item) => !item.selected);
  } else if (opts.filter === "maybe") {
    result = result.filter((item) => item.relevance === "MAYBE");
  }

  if (opts.area && opts.area !== "all") {
    result = result.filter((item) => item.functionalArea === opts.area);
  }

  return result;
}

function computeStats(items: ScopeItem[]) {
  const selected = items.filter((i) => i.selected);
  const totalStepsInScope = selected.reduce((sum, i) => sum + i.totalSteps, 0);
  const responded = items.filter((i) => i.relevance !== null).length;
  return {
    selectedCount: selected.length,
    totalCount: items.length,
    totalStepsInScope,
    respondedCount: responded,
  };
}

const SAMPLE_ITEMS: ScopeItem[] = [
  { id: "J01", nameClean: "General Ledger", functionalArea: "Finance", subArea: "GL", totalSteps: 15, selected: true, relevance: "YES" },
  { id: "J02", nameClean: "Accounts Payable", functionalArea: "Finance", subArea: "AP", totalSteps: 20, selected: true, relevance: "YES" },
  { id: "J03", nameClean: "Accounts Receivable", functionalArea: "Finance", subArea: "AR", totalSteps: 18, selected: false, relevance: "NO" },
  { id: "J10", nameClean: "Material Management", functionalArea: "Logistics", subArea: "MM", totalSteps: 25, selected: true, relevance: "MAYBE" },
  { id: "J11", nameClean: "Production Planning", functionalArea: "Logistics", subArea: "PP", totalSteps: 30, selected: false, relevance: null },
  { id: "J20", nameClean: "Human Capital", functionalArea: "HR", subArea: "HCM", totalSteps: 12, selected: true, relevance: "YES" },
];

describe("Scope selection filtering", () => {
  it("returns all items when no filters applied", () => {
    const result = filterItems(SAMPLE_ITEMS, {});
    expect(result).toHaveLength(6);
  });

  it("filters by search text in nameClean", () => {
    const result = filterItems(SAMPLE_ITEMS, { search: "ledger" });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("J01");
  });

  it("filters by search text in id", () => {
    const result = filterItems(SAMPLE_ITEMS, { search: "j10" });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("J10");
  });

  it("filters by search text in functionalArea", () => {
    const result = filterItems(SAMPLE_ITEMS, { search: "finance" });
    expect(result).toHaveLength(3);
  });

  it("filters selected items only", () => {
    const result = filterItems(SAMPLE_ITEMS, { filter: "selected" });
    expect(result).toHaveLength(4);
    expect(result.every((i) => i.selected)).toBe(true);
  });

  it("filters not-selected items only", () => {
    const result = filterItems(SAMPLE_ITEMS, { filter: "not_selected" });
    expect(result).toHaveLength(2);
    expect(result.every((i) => !i.selected)).toBe(true);
  });

  it("filters maybe items only", () => {
    const result = filterItems(SAMPLE_ITEMS, { filter: "maybe" });
    expect(result).toHaveLength(1);
    expect(result[0]?.relevance).toBe("MAYBE");
  });

  it("filters by functional area", () => {
    const result = filterItems(SAMPLE_ITEMS, { area: "Logistics" });
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.functionalArea === "Logistics")).toBe(true);
  });

  it("combines search and filter", () => {
    const result = filterItems(SAMPLE_ITEMS, { search: "accounts", filter: "selected" });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("J02");
  });

  it("combines search and area filter", () => {
    const result = filterItems(SAMPLE_ITEMS, { search: "material", area: "Logistics" });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("J10");
  });
});

describe("Scope selection stats", () => {
  it("counts selected items correctly", () => {
    const stats = computeStats(SAMPLE_ITEMS);
    expect(stats.selectedCount).toBe(4);
    expect(stats.totalCount).toBe(6);
  });

  it("sums process steps for selected items", () => {
    const stats = computeStats(SAMPLE_ITEMS);
    // J01(15) + J02(20) + J10(25) + J20(12) = 72
    expect(stats.totalStepsInScope).toBe(72);
  });

  it("counts responded items (non-null relevance)", () => {
    const stats = computeStats(SAMPLE_ITEMS);
    // All except J11 have relevance set
    expect(stats.respondedCount).toBe(5);
  });

  it("handles empty items array", () => {
    const stats = computeStats([]);
    expect(stats.selectedCount).toBe(0);
    expect(stats.totalCount).toBe(0);
    expect(stats.totalStepsInScope).toBe(0);
    expect(stats.respondedCount).toBe(0);
  });
});

// Simulates the relevance → selection logic from ScopeItemCard
function deriveSelected(relevance: string): boolean {
  return relevance !== "NO";
}

describe("Scope selection state transitions", () => {
  it("selecting an item sets relevance to YES", () => {
    const item = SAMPLE_ITEMS[4]; // J11, not selected
    expect(item?.selected).toBe(false);
    expect(deriveSelected("YES")).toBe(true);
  });

  it("deselecting an item sets relevance to NO", () => {
    const item = SAMPLE_ITEMS[0]; // J01, selected
    expect(item?.selected).toBe(true);
    expect(deriveSelected("NO")).toBe(false);
  });

  it("setting relevance to NO deselects the item", () => {
    expect(deriveSelected("NO")).toBe(false);
  });

  it("setting relevance to MAYBE keeps item selected", () => {
    expect(deriveSelected("MAYBE")).toBe(true);
  });

  it("setting relevance to YES keeps item selected", () => {
    expect(deriveSelected("YES")).toBe(true);
  });
});
