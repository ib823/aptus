import { describe, it, expect } from "vitest";
import { computeVoteTally } from "@/lib/workshop/vote-tally";

describe("computeVoteTally (Phase 21)", () => {
  it("returns empty tally for no votes", () => {
    const tally = computeVoteTally("step-1", []);
    expect(tally.totalVotes).toBe(0);
    expect(tally.hasConsensus).toBe(false);
    expect(tally.consensus).toBeNull();
    expect(tally.entries).toHaveLength(4);
    for (const entry of tally.entries) {
      expect(entry.count).toBe(0);
      expect(entry.percentage).toBe(0);
    }
  });

  it("detects consensus when >50% agree", () => {
    const votes = [
      { userId: "u1", classification: "FIT" },
      { userId: "u2", classification: "FIT" },
      { userId: "u3", classification: "GAP" },
    ];
    const tally = computeVoteTally("step-1", votes);
    expect(tally.hasConsensus).toBe(true);
    expect(tally.consensus).toBe("FIT");
    expect(tally.consensusPercentage).toBe(67);
  });

  it("does not detect consensus at exactly 50%", () => {
    const votes = [
      { userId: "u1", classification: "FIT" },
      { userId: "u2", classification: "GAP" },
    ];
    const tally = computeVoteTally("step-1", votes);
    expect(tally.hasConsensus).toBe(false);
    expect(tally.consensus).toBeNull();
  });

  it("reports unanimous consensus", () => {
    const votes = [
      { userId: "u1", classification: "CONFIGURE" },
      { userId: "u2", classification: "CONFIGURE" },
      { userId: "u3", classification: "CONFIGURE" },
    ];
    const tally = computeVoteTally("step-1", votes);
    expect(tally.hasConsensus).toBe(true);
    expect(tally.consensus).toBe("CONFIGURE");
    expect(tally.consensusPercentage).toBe(100);
  });

  it("counts votes correctly per classification", () => {
    const votes = [
      { userId: "u1", classification: "FIT" },
      { userId: "u2", classification: "FIT" },
      { userId: "u3", classification: "CONFIGURE" },
      { userId: "u4", classification: "GAP" },
      { userId: "u5", classification: "NA" },
    ];
    const tally = computeVoteTally("step-1", votes);
    expect(tally.totalVotes).toBe(5);

    const fitEntry = tally.entries.find((e) => e.classification === "FIT");
    expect(fitEntry?.count).toBe(2);
    expect(fitEntry?.percentage).toBe(40);
    expect(fitEntry?.voters).toContain("u1");
    expect(fitEntry?.voters).toContain("u2");

    const configEntry = tally.entries.find((e) => e.classification === "CONFIGURE");
    expect(configEntry?.count).toBe(1);

    const gapEntry = tally.entries.find((e) => e.classification === "GAP");
    expect(gapEntry?.count).toBe(1);

    const naEntry = tally.entries.find((e) => e.classification === "NA");
    expect(naEntry?.count).toBe(1);
  });

  it("includes processStepId in result", () => {
    const tally = computeVoteTally("step-xyz", []);
    expect(tally.processStepId).toBe("step-xyz");
  });

  it("ignores invalid classifications", () => {
    const votes = [
      { userId: "u1", classification: "FIT" },
      { userId: "u2", classification: "INVALID" },
    ];
    const tally = computeVoteTally("step-1", votes);
    // Only FIT is counted; INVALID is ignored but still in totalVotes
    const fitEntry = tally.entries.find((e) => e.classification === "FIT");
    expect(fitEntry?.count).toBe(1);
  });

  it("handles single vote as consensus", () => {
    const votes = [{ userId: "u1", classification: "GAP" }];
    const tally = computeVoteTally("step-1", votes);
    expect(tally.hasConsensus).toBe(true);
    expect(tally.consensus).toBe("GAP");
    expect(tally.consensusPercentage).toBe(100);
  });
});
