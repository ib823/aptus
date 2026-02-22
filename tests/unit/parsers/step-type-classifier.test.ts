/**
 * STATUS: Wired to real production code
 * REAL MODULE: src/lib/assessment/step-classifier.ts
 */
import { describe, it, expect } from "vitest";
import { classifyStep } from "@/lib/assessment/step-classifier";

// ---------------------------------------------------------------------------
// Tests — uses real classifyStep which handles both uppercase DB format
// and lowercase SAP tag format via case-insensitive lookup
// ---------------------------------------------------------------------------

describe("classifyStepType", () => {
  it("T-STC-001: maps 'Information' tag to REFERENCE", () => {
    expect(classifyStep("Information")).toBe("REFERENCE");
  });

  it("T-STC-002: maps 'LogOn' tag to SYSTEM_ACCESS", () => {
    expect(classifyStep("LogOn")).toBe("SYSTEM_ACCESS");
  });

  it("T-STC-003: maps 'LogOff' tag to SYSTEM_ACCESS", () => {
    expect(classifyStep("LogOff")).toBe("SYSTEM_ACCESS");
  });

  it("T-STC-004: maps 'TestProcedure' tag to TEST_INFO", () => {
    expect(classifyStep("TestProcedure")).toBe("TEST_INFO");
  });

  it("T-STC-005: maps 'BusinessProcess' tag to BUSINESS_PROCESS", () => {
    expect(classifyStep("BusinessProcess")).toBe("BUSINESS_PROCESS");
  });

  it("T-STC-006: maps 'Configuration' tag to CONFIGURATION", () => {
    expect(classifyStep("Configuration")).toBe("CONFIGURATION");
  });

  it("T-STC-007: maps 'Reporting' tag to REPORTING", () => {
    expect(classifyStep("Reporting")).toBe("REPORTING");
  });

  it("T-STC-008: maps 'MasterData' tag to MASTER_DATA", () => {
    expect(classifyStep("MasterData")).toBe("MASTER_DATA");
  });

  it("T-STC-009: maps unknown tag to default BUSINESS_PROCESS", () => {
    expect(classifyStep("SomethingRandom")).toBe("BUSINESS_PROCESS");
    expect(classifyStep("")).toBe("BUSINESS_PROCESS");
    expect(classifyStep("   ")).toBe("BUSINESS_PROCESS");
  });

  it("T-STC-010: maps null tag to default BUSINESS_PROCESS", () => {
    expect(classifyStep(null)).toBe("BUSINESS_PROCESS");
  });

  it("T-STC-011: case-insensitive matching — 'INFORMATION' maps to REFERENCE", () => {
    expect(classifyStep("INFORMATION")).toBe("REFERENCE");
    expect(classifyStep("information")).toBe("REFERENCE");
    expect(classifyStep("InFoRmAtIoN")).toBe("REFERENCE");
    expect(classifyStep("LOGON")).toBe("SYSTEM_ACCESS");
    expect(classifyStep("logoff")).toBe("SYSTEM_ACCESS");
    expect(classifyStep("CONFIGURATION")).toBe("CONFIGURATION");
    expect(classifyStep("MASTERDATA")).toBe("MASTER_DATA");
  });
});
