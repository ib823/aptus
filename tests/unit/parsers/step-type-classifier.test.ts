import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Step Type Classification
// ---------------------------------------------------------------------------

type StepCategory =
  | "REFERENCE"
  | "SYSTEM_ACCESS"
  | "TEST_INFO"
  | "BUSINESS_PROCESS"
  | "CONFIGURATION"
  | "REPORTING"
  | "MASTER_DATA";

const TAG_TO_CATEGORY: Record<string, StepCategory> = {
  information: "REFERENCE",
  logon: "SYSTEM_ACCESS",
  logoff: "SYSTEM_ACCESS",
  testprocedure: "TEST_INFO",
  businessprocess: "BUSINESS_PROCESS",
  configuration: "CONFIGURATION",
  reporting: "REPORTING",
  masterdata: "MASTER_DATA",
};

/**
 * Classifies a step tag string into a StepCategory enum value.
 * Returns "BUSINESS_PROCESS" as default for unknown, empty, or null tags.
 * Matching is case-insensitive.
 */
function classifyStepType(tag: string | null): StepCategory {
  if (tag == null || tag.trim() === "") {
    return "BUSINESS_PROCESS";
  }
  const normalised = tag.toLowerCase().trim();
  return TAG_TO_CATEGORY[normalised] ?? "BUSINESS_PROCESS";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("classifyStepType", () => {
  it("T-STC-001: maps 'Information' tag to REFERENCE", () => {
    expect(classifyStepType("Information")).toBe("REFERENCE");
  });

  it("T-STC-002: maps 'LogOn' tag to SYSTEM_ACCESS", () => {
    expect(classifyStepType("LogOn")).toBe("SYSTEM_ACCESS");
  });

  it("T-STC-003: maps 'LogOff' tag to SYSTEM_ACCESS", () => {
    expect(classifyStepType("LogOff")).toBe("SYSTEM_ACCESS");
  });

  it("T-STC-004: maps 'TestProcedure' tag to TEST_INFO", () => {
    expect(classifyStepType("TestProcedure")).toBe("TEST_INFO");
  });

  it("T-STC-005: maps 'BusinessProcess' tag to BUSINESS_PROCESS", () => {
    expect(classifyStepType("BusinessProcess")).toBe("BUSINESS_PROCESS");
  });

  it("T-STC-006: maps 'Configuration' tag to CONFIGURATION", () => {
    expect(classifyStepType("Configuration")).toBe("CONFIGURATION");
  });

  it("T-STC-007: maps 'Reporting' tag to REPORTING", () => {
    expect(classifyStepType("Reporting")).toBe("REPORTING");
  });

  it("T-STC-008: maps 'MasterData' tag to MASTER_DATA", () => {
    expect(classifyStepType("MasterData")).toBe("MASTER_DATA");
  });

  it("T-STC-009: maps unknown tag to default BUSINESS_PROCESS", () => {
    expect(classifyStepType("SomethingRandom")).toBe("BUSINESS_PROCESS");
    expect(classifyStepType("")).toBe("BUSINESS_PROCESS");
    expect(classifyStepType("   ")).toBe("BUSINESS_PROCESS");
  });

  it("T-STC-010: maps null tag to default BUSINESS_PROCESS", () => {
    expect(classifyStepType(null)).toBe("BUSINESS_PROCESS");
  });

  it("T-STC-011: case-insensitive matching — 'INFORMATION' maps to REFERENCE", () => {
    expect(classifyStepType("INFORMATION")).toBe("REFERENCE");
    expect(classifyStepType("information")).toBe("REFERENCE");
    expect(classifyStepType("InFoRmAtIoN")).toBe("REFERENCE");
    expect(classifyStepType("LOGON")).toBe("SYSTEM_ACCESS");
    expect(classifyStepType("logoff")).toBe("SYSTEM_ACCESS");
    expect(classifyStepType("CONFIGURATION")).toBe("CONFIGURATION");
    expect(classifyStepType("MASTERDATA")).toBe("MASTER_DATA");
  });
});
