import { describe, it, expect } from "vitest";
import {
  PROCESS_LANDSCAPES,
  KNOWN_FUNCTIONAL_AREAS,
  getLandscape,
  getChainScopeItemIds,
  getAreaScopeItemIds,
  type FunctionalAreaLandscape,
} from "@/constants/process-chains";

describe("PROCESS_LANDSCAPES", () => {
  it("all area names exist in KNOWN_FUNCTIONAL_AREAS", () => {
    for (const landscape of PROCESS_LANDSCAPES) {
      expect(
        (KNOWN_FUNCTIONAL_AREAS as readonly string[]).includes(landscape.area),
        `"${landscape.area}" is not in KNOWN_FUNCTIONAL_AREAS`,
      ).toBe(true);
    }
  });

  it("has no duplicate area names", () => {
    const areaNames = PROCESS_LANDSCAPES.map((l) => l.area);
    const unique = new Set(areaNames);
    expect(areaNames.length).toBe(unique.size);
  });

  it("every area has a businessDescription", () => {
    for (const landscape of PROCESS_LANDSCAPES) {
      expect(
        typeof landscape.businessDescription,
        `${landscape.area} businessDescription should be a string`,
      ).toBe("string");
    }
  });

  it("covers all 20 known functional areas", () => {
    const definedAreas = new Set(PROCESS_LANDSCAPES.map((l) => l.area));
    for (const area of KNOWN_FUNCTIONAL_AREAS) {
      expect(
        definedAreas.has(area),
        `Missing PROCESS_LANDSCAPES entry for "${area}"`,
      ).toBe(true);
    }
  });

  it("all chain scope item IDs are valid format (alphanumeric, 1-4 chars)", () => {
    for (const landscape of PROCESS_LANDSCAPES) {
      for (const chain of landscape.chains) {
        for (const step of chain.steps) {
          expect(
            step.scopeItemId,
            `Invalid scope item ID format in ${landscape.area} → ${chain.key}`,
          ).toMatch(/^[A-Z0-9]{1,4}$/);
        }
      }
    }
  });

  it("all chain step positions are valid", () => {
    const validPositions = new Set(["start", "middle", "end", "branch"]);
    for (const landscape of PROCESS_LANDSCAPES) {
      for (const chain of landscape.chains) {
        for (const step of chain.steps) {
          expect(
            validPositions.has(step.position),
            `Invalid position "${step.position}" in ${landscape.area} → ${chain.key} → ${step.scopeItemId}`,
          ).toBe(true);
        }
      }
    }
  });

  it("each chain has a unique key within its area", () => {
    for (const landscape of PROCESS_LANDSCAPES) {
      const keys = landscape.chains.map((c) => c.key);
      const unique = new Set(keys);
      expect(
        keys.length,
        `Duplicate chain key in ${landscape.area}`,
      ).toBe(unique.size);
    }
  });

  it("branch steps reference valid followsStepIndex", () => {
    for (const landscape of PROCESS_LANDSCAPES) {
      for (const chain of landscape.chains) {
        for (const step of chain.steps) {
          if (step.position === "branch" && step.followsStepIndex !== undefined) {
            expect(
              step.followsStepIndex,
              `followsStepIndex out of range in ${landscape.area} → ${chain.key}`,
            ).toBeLessThan(chain.steps.length);
            expect(step.followsStepIndex).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe("getLandscape", () => {
  it("returns landscape for all defined areas", () => {
    for (const landscape of PROCESS_LANDSCAPES) {
      const result = getLandscape(landscape.area);
      expect(result).not.toBeNull();
      expect(result!.area).toBe(landscape.area);
    }
  });

  it("returns null for unknown area", () => {
    expect(getLandscape("Nonexistent Area")).toBeNull();
  });

  it("returns results for previously-mismatched areas", () => {
    // These used to have wrong names and were unreachable
    expect(getLandscape("Sourcing and Procurement")).not.toBeNull();
    expect(getLandscape("Logistics")).not.toBeNull();
    expect(getLandscape("Manufacturing")).not.toBeNull();
    expect(getLandscape("Asset Management")).not.toBeNull();
    expect(getLandscape("Service")).not.toBeNull();
  });
});

describe("getChainScopeItemIds", () => {
  it("returns all scope item IDs in a chain", () => {
    const finance = getLandscape("Finance")!;
    const r2r = finance.chains.find((c) => c.key === "r2r")!;
    const ids = getChainScopeItemIds(r2r);
    expect(ids).toContain("J63");
    expect(ids).toContain("J58");
    expect(ids).toContain("J58A");
    expect(ids).toContain("1K2");
    expect(ids).toHaveLength(4);
  });
});

describe("getAreaScopeItemIds", () => {
  it("returns all unique scope item IDs across all chains in an area", () => {
    const finance = getLandscape("Finance")!;
    const ids = getAreaScopeItemIds(finance);
    // 1EG appears in two chains but should only be listed once
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
    expect(ids).toContain("J63");
    expect(ids).toContain("J60");
    expect(ids).toContain("J59");
  });

  it("returns empty array for area with no chains", () => {
    const hr = getLandscape("Human Resources")!;
    expect(getAreaScopeItemIds(hr)).toEqual([]);
  });
});

describe("KNOWN_FUNCTIONAL_AREAS", () => {
  it("is sorted alphabetically", () => {
    const sorted = [...KNOWN_FUNCTIONAL_AREAS].sort();
    expect([...KNOWN_FUNCTIONAL_AREAS]).toEqual(sorted);
  });

  it("has 20 entries", () => {
    expect(KNOWN_FUNCTIONAL_AREAS).toHaveLength(20);
  });
});
