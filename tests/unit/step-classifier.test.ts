import { describe, it, expect } from "vitest";
import { classifyStep, isStepClassifiable, deriveGroupKey, deriveGroupLabel } from "@/lib/assessment/step-classifier";

describe("classifyStep", () => {
  it("maps LOGON to SYSTEM_ACCESS", () => {
    expect(classifyStep("LOGON")).toBe("SYSTEM_ACCESS");
  });

  it("maps ACCESS_APP to SYSTEM_ACCESS", () => {
    expect(classifyStep("ACCESS_APP")).toBe("SYSTEM_ACCESS");
  });

  it("maps INFORMATION to REFERENCE", () => {
    expect(classifyStep("INFORMATION")).toBe("REFERENCE");
  });

  it("maps NAVIGATION to REFERENCE", () => {
    expect(classifyStep("NAVIGATION")).toBe("REFERENCE");
  });

  it("maps DATA_ENTRY to BUSINESS_PROCESS", () => {
    expect(classifyStep("DATA_ENTRY")).toBe("BUSINESS_PROCESS");
  });

  it("maps ACTION to BUSINESS_PROCESS", () => {
    expect(classifyStep("ACTION")).toBe("BUSINESS_PROCESS");
  });

  it("maps VERIFICATION to BUSINESS_PROCESS", () => {
    expect(classifyStep("VERIFICATION")).toBe("BUSINESS_PROCESS");
  });

  it("maps PROCESS_STEP to BUSINESS_PROCESS", () => {
    expect(classifyStep("PROCESS_STEP")).toBe("BUSINESS_PROCESS");
  });

  it("defaults unknown types to BUSINESS_PROCESS", () => {
    expect(classifyStep("UNKNOWN_TYPE")).toBe("BUSINESS_PROCESS");
  });
});

describe("isStepClassifiable", () => {
  it("returns true for BUSINESS_PROCESS", () => {
    expect(isStepClassifiable("BUSINESS_PROCESS")).toBe(true);
  });

  it("returns true for CONFIGURATION", () => {
    expect(isStepClassifiable("CONFIGURATION")).toBe(true);
  });

  it("returns true for REPORTING", () => {
    expect(isStepClassifiable("REPORTING")).toBe(true);
  });

  it("returns true for MASTER_DATA", () => {
    expect(isStepClassifiable("MASTER_DATA")).toBe(true);
  });

  it("returns false for REFERENCE", () => {
    expect(isStepClassifiable("REFERENCE")).toBe(false);
  });

  it("returns false for SYSTEM_ACCESS", () => {
    expect(isStepClassifiable("SYSTEM_ACCESS")).toBe(false);
  });

  it("returns false for TEST_INFO", () => {
    expect(isStepClassifiable("TEST_INFO")).toBe(false);
  });
});

describe("deriveGroupKey", () => {
  it("combines stepCategory and activityTitle", () => {
    expect(
      deriveGroupKey({ stepCategory: "BUSINESS_PROCESS", activityTitle: "Create Sales Order" }),
    ).toBe("BUSINESS_PROCESS:Create Sales Order");
  });

  it("uses 'ungrouped' when activityTitle is null", () => {
    expect(
      deriveGroupKey({ stepCategory: "REFERENCE", activityTitle: null }),
    ).toBe("REFERENCE:ungrouped");
  });
});

describe("deriveGroupLabel", () => {
  it("returns human-readable label with activity", () => {
    expect(
      deriveGroupLabel({ stepCategory: "BUSINESS_PROCESS", activityTitle: "Create Sales Order" }),
    ).toBe("Business Process — Create Sales Order");
  });

  it("returns just the category label when no activity", () => {
    expect(
      deriveGroupLabel({ stepCategory: "SYSTEM_ACCESS", activityTitle: null }),
    ).toBe("System Access");
  });

  it("handles unknown categories gracefully", () => {
    expect(
      deriveGroupLabel({ stepCategory: "UNKNOWN", activityTitle: null }),
    ).toBe("UNKNOWN");
  });
});
