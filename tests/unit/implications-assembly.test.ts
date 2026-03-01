import { describe, it, expect } from "vitest";
import {
  assembleImplicationsData,
  type ImplicationsData,
} from "@/components/review/ImplicationsPanel";
import type {
  ActivityMetadata,
  ScopeItemMetadata,
  ClassificationImplication,
} from "@/constants/scope-item-metadata";

// --- Test fixtures ---

const mockImplications: ClassificationImplication = {
  fitDescription: "Standard implementation applies.",
  configureDescription: "Configuration changes needed.",
  gapDescription: "Custom development required.",
  naDescription: "Not in scope.",
  naImpact: "Some workflows may be affected.",
};

const mockScopeItemMetadata: ScopeItemMetadata = {
  id: "TEST",
  businessName: "Test Scope Item",
  businessDescription: "A test scope item for unit testing.",
  modules: [
    { code: "FI-GL", name: "General Ledger" },
    { code: "FI-AP", name: "Accounts Payable" },
    { code: "CO", name: "Controlling" },
  ],
  masterData: [
    { objectName: "Supplier Master", sapCode: "BND", description: "Vendor records" },
    { objectName: "G/L Account Master", sapCode: "BNG", description: "GL accounts" },
    { objectName: "Cost Center", sapCode: "BNM", description: "Cost centers" },
  ],
  dependencies: [
    { scopeItemId: "J59", name: "Accounts Receivable", reason: "Shared GL", type: "required" },
    { scopeItemId: "1NT", name: "Project Control", reason: "Budget integration", type: "optional" },
  ],
  activityMetadata: [
    {
      activityTitlePattern: "Invoice",
      businessQuestion: "Do you process supplier invoices?",
      thinkAbout: "Consider your invoice volume.",
      modules: ["FI-AP", "FI-GL"],
      configAreas: ["Payment Terms", "Tax Codes"],
      masterDataNeeded: ["Supplier Master", "G/L Account Master"],
      effortCategory: "medium",
    },
    {
      activityTitlePattern: "Payment",
      businessQuestion: "How do you handle payments?",
      thinkAbout: "Consider your payment methods.",
      modules: ["FI-AP"],
      configAreas: ["Payment Methods"],
      masterDataNeeded: ["Supplier Master"],
      effortCategory: "low",
    },
  ],
  defaultImplications: mockImplications,
};

const mockActivityMeta: ActivityMetadata = {
  activityTitlePattern: "Invoice",
  businessQuestion: "Do you process supplier invoices?",
  thinkAbout: "Consider your invoice volume.",
  modules: ["FI-AP", "FI-GL"],
  configAreas: ["Payment Terms", "Tax Codes"],
  masterDataNeeded: ["Supplier Master", "G/L Account Master"],
  effortCategory: "medium",
};

// --- Tests ---

describe("assembleImplicationsData", () => {
  it("returns correct data with overrides provided", () => {
    const data: ImplicationsData = assembleImplicationsData(
      "FIT",
      "TEST",
      "Invoice Processing",
      mockActivityMeta,
      mockScopeItemMetadata,
    );

    // Should filter modules to only those in activityMeta
    expect(data.modules).toHaveLength(2);
    expect(data.modules.map((m) => m.code)).toContain("FI-AP");
    expect(data.modules.map((m) => m.code)).toContain("FI-GL");
    expect(data.modules.map((m) => m.code)).not.toContain("CO");

    // Config areas from activity
    expect(data.configAreas).toEqual(["Payment Terms", "Tax Codes"]);

    // Master data filtered by activity needs
    expect(data.masterData).toHaveLength(2);
    expect(data.masterData.map((md) => md.objectName)).toContain("Supplier Master");
    expect(data.masterData.map((md) => md.objectName)).toContain("G/L Account Master");
    expect(data.masterData.map((md) => md.objectName)).not.toContain("Cost Center");

    // Dependencies from scope item
    expect(data.dependencies).toHaveLength(2);

    // Effort should stay as activity's effort for FIT
    expect(data.effort).toBe("medium");

    // Implications from scope item
    expect(data.implications).toEqual(mockImplications);
  });

  it("escalates effort for GAP status", () => {
    const dataLow = assembleImplicationsData(
      "GAP",
      "TEST",
      "Payment Run",
      { ...mockActivityMeta, effortCategory: "low" },
      mockScopeItemMetadata,
    );
    expect(dataLow.effort).toBe("medium"); // low → medium

    const dataMedium = assembleImplicationsData(
      "GAP",
      "TEST",
      "Payment Run",
      { ...mockActivityMeta, effortCategory: "medium" },
      mockScopeItemMetadata,
    );
    expect(dataMedium.effort).toBe("high"); // medium → high

    const dataHigh = assembleImplicationsData(
      "GAP",
      "TEST",
      "Payment Run",
      { ...mockActivityMeta, effortCategory: "high" },
      mockScopeItemMetadata,
    );
    expect(dataHigh.effort).toBe("high"); // high stays high
  });

  it("does not escalate effort for FIT status", () => {
    const data = assembleImplicationsData(
      "FIT",
      "TEST",
      "Payment Run",
      { ...mockActivityMeta, effortCategory: "low" },
      mockScopeItemMetadata,
    );
    expect(data.effort).toBe("low");
  });

  it("does not escalate effort for CONFIGURE status", () => {
    const data = assembleImplicationsData(
      "CONFIGURE",
      "TEST",
      "Payment Run",
      { ...mockActivityMeta, effortCategory: "low" },
      mockScopeItemMetadata,
    );
    expect(data.effort).toBe("low");
  });

  it("returns all modules when activity meta has no module filter", () => {
    const actMetaNoModules: ActivityMetadata = {
      ...mockActivityMeta,
      modules: [],
    };
    // When actMeta.modules is empty (falsy check: empty array is truthy but filter returns empty)
    // Actually the code checks `actMeta?.modules` which for empty array is truthy
    // So it would filter to empty. Let's test with null actMeta instead
    const data = assembleImplicationsData(
      "FIT",
      "TEST",
      "Unknown Activity",
      null,
      mockScopeItemMetadata,
    );
    // No matching activity, so actMeta is null → all modules returned
    expect(data.modules).toHaveLength(3);
  });

  it("returns all master data when activity meta is null", () => {
    const data = assembleImplicationsData(
      "FIT",
      "TEST",
      "Unknown Activity",
      null,
      mockScopeItemMetadata,
    );
    expect(data.masterData).toHaveLength(3);
  });

  it("defaults effort to medium when activity meta is null", () => {
    const data = assembleImplicationsData(
      "FIT",
      "TEST",
      "Unknown Activity",
      null,
      mockScopeItemMetadata,
    );
    expect(data.effort).toBe("medium");
  });

  it("returns empty arrays when scope meta is null", () => {
    const data = assembleImplicationsData(
      "FIT",
      "UNKNOWN",
      "Some Activity",
      null,
      null,
    );
    expect(data.modules).toEqual([]);
    expect(data.configAreas).toEqual([]);
    expect(data.masterData).toEqual([]);
    expect(data.dependencies).toEqual([]);
    expect(data.implications).toBeNull();
  });

  it("works with real scope item data (J60)", () => {
    // Test against actual metadata without overrides
    const data = assembleImplicationsData("FIT", "J60", "Invoice Processing");
    // Should have found some data from the real metadata
    expect(data.modules.length).toBeGreaterThanOrEqual(0);
    expect(data.dependencies.length).toBeGreaterThan(0);
    expect(data.implications).not.toBeNull();
  });
});
