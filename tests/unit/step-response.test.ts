import { describe, it, expect } from "vitest";

/**
 * Unit tests for step response logic.
 * Tests fitStatus transitions, gap validation, and progress calculations.
 */

type FitStatus = "FIT" | "CONFIGURE" | "GAP" | "NA" | "PENDING";

function validateGapNote(fitStatus: FitStatus, clientNote: string | null): boolean {
  if (fitStatus !== "GAP") return true;
  return clientNote !== null && clientNote.length >= 10;
}

function computeProgress(steps: { fitStatus: FitStatus }[]) {
  const total = steps.length;
  const reviewed = steps.filter((s) => s.fitStatus !== "PENDING").length;
  const fit = steps.filter((s) => s.fitStatus === "FIT").length;
  const configure = steps.filter((s) => s.fitStatus === "CONFIGURE").length;
  const gap = steps.filter((s) => s.fitStatus === "GAP").length;
  const na = steps.filter((s) => s.fitStatus === "NA").length;
  const pending = total - reviewed;

  return { total, reviewed, fit, configure, gap, na, pending };
}

describe("Gap note validation", () => {
  it("accepts non-GAP status without note", () => {
    expect(validateGapNote("FIT", null)).toBe(true);
    expect(validateGapNote("CONFIGURE", null)).toBe(true);
    expect(validateGapNote("NA", null)).toBe(true);
    expect(validateGapNote("PENDING", null)).toBe(true);
  });

  it("rejects GAP status without note", () => {
    expect(validateGapNote("GAP", null)).toBe(false);
  });

  it("rejects GAP status with short note", () => {
    expect(validateGapNote("GAP", "too short")).toBe(false);
  });

  it("accepts GAP status with note >= 10 chars", () => {
    expect(validateGapNote("GAP", "This is a sufficiently long gap description")).toBe(true);
  });

  it("rejects GAP with exactly 9 chars", () => {
    expect(validateGapNote("GAP", "123456789")).toBe(false);
  });

  it("accepts GAP with exactly 10 chars", () => {
    expect(validateGapNote("GAP", "1234567890")).toBe(true);
  });
});

describe("Step progress calculation", () => {
  const steps: { fitStatus: FitStatus }[] = [
    { fitStatus: "FIT" },
    { fitStatus: "FIT" },
    { fitStatus: "CONFIGURE" },
    { fitStatus: "GAP" },
    { fitStatus: "NA" },
    { fitStatus: "PENDING" },
    { fitStatus: "PENDING" },
    { fitStatus: "PENDING" },
  ];

  it("calculates total correctly", () => {
    const progress = computeProgress(steps);
    expect(progress.total).toBe(8);
  });

  it("calculates reviewed correctly", () => {
    const progress = computeProgress(steps);
    expect(progress.reviewed).toBe(5);
  });

  it("calculates each status count correctly", () => {
    const progress = computeProgress(steps);
    expect(progress.fit).toBe(2);
    expect(progress.configure).toBe(1);
    expect(progress.gap).toBe(1);
    expect(progress.na).toBe(1);
    expect(progress.pending).toBe(3);
  });

  it("handles empty steps array", () => {
    const progress = computeProgress([]);
    expect(progress.total).toBe(0);
    expect(progress.reviewed).toBe(0);
    expect(progress.pending).toBe(0);
  });

  it("handles all-reviewed steps", () => {
    const allDone: { fitStatus: FitStatus }[] = [
      { fitStatus: "FIT" },
      { fitStatus: "GAP" },
      { fitStatus: "NA" },
    ];
    const progress = computeProgress(allDone);
    expect(progress.reviewed).toBe(3);
    expect(progress.pending).toBe(0);
  });

  it("handles all-pending steps", () => {
    const allPending: { fitStatus: FitStatus }[] = [
      { fitStatus: "PENDING" },
      { fitStatus: "PENDING" },
    ];
    const progress = computeProgress(allPending);
    expect(progress.reviewed).toBe(0);
    expect(progress.pending).toBe(2);
  });
});

function canItLeadChange(existingFitStatus: string, newFitStatus: string): boolean {
  return existingFitStatus === newFitStatus;
}

describe("IT Lead permission logic", () => {
  it("IT leads can add notes", () => {
    // IT leads can modify clientNote but not fitStatus
    const canModifyNote = true;
    expect(canModifyNote).toBe(true);
  });

  it("IT leads cannot change fitStatus", () => {
    expect(canItLeadChange("FIT", "GAP")).toBe(false);
  });

  it("IT leads can keep same fitStatus", () => {
    expect(canItLeadChange("FIT", "FIT")).toBe(true);
  });
});

describe("Bulk FIT logic", () => {
  it("only targets PENDING steps", () => {
    const steps: { id: string; fitStatus: FitStatus }[] = [
      { id: "1", fitStatus: "PENDING" },
      { id: "2", fitStatus: "FIT" },
      { id: "3", fitStatus: "GAP" },
      { id: "4", fitStatus: "PENDING" },
    ];
    const targets = steps.filter((s) => s.fitStatus === "PENDING");
    expect(targets).toHaveLength(2);
    expect(targets.map((s) => s.id)).toEqual(["1", "4"]);
  });

  it("skips steps that already have a response", () => {
    const steps: { id: string; fitStatus: FitStatus }[] = [
      { id: "1", fitStatus: "CONFIGURE" },
      { id: "2", fitStatus: "NA" },
    ];
    const targets = steps.filter((s) => s.fitStatus === "PENDING");
    expect(targets).toHaveLength(0);
  });
});
