import { describe, it, expect } from "vitest";
import { computeSequentialLayout, generateThumbnailSvg } from "@/lib/assessment/flow-layout";
import type { LayoutStep } from "@/lib/assessment/flow-layout";

describe("computeSequentialLayout (Phase 20)", () => {
  it("returns empty result for no steps", () => {
    const result = computeSequentialLayout([]);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.viewBox.width).toBe(0);
    expect(result.viewBox.height).toBe(0);
  });

  it("lays out a single step", () => {
    const steps: LayoutStep[] = [
      { id: "s1", sequence: 1, actionTitle: "Step 1", fitStatus: "FIT", scopeItemId: "J60", processStepId: "ps1" },
    ];
    const result = computeSequentialLayout(steps);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    const node = result.nodes[0]!;
    expect(node.position.x).toBe(20); // PADDING
    expect(node.position.y).toBe(20);
  });

  it("creates edges between consecutive nodes", () => {
    const steps: LayoutStep[] = [
      { id: "s1", sequence: 1, actionTitle: "Step 1", fitStatus: "FIT", scopeItemId: "J60", processStepId: "ps1" },
      { id: "s2", sequence: 2, actionTitle: "Step 2", fitStatus: "GAP", scopeItemId: "J60", processStepId: "ps2" },
      { id: "s3", sequence: 3, actionTitle: "Step 3", fitStatus: "CONFIGURE", scopeItemId: "J60", processStepId: "ps3" },
    ];
    const result = computeSequentialLayout(steps);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });

  it("wraps to next row after 4 nodes", () => {
    const steps: LayoutStep[] = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      sequence: i + 1,
      actionTitle: `Step ${i + 1}`,
      fitStatus: "FIT",
      scopeItemId: "J60",
      processStepId: `ps${i}`,
    }));
    const result = computeSequentialLayout(steps);
    expect(result.nodes).toHaveLength(5);
    const fifthNode = result.nodes[4]!;
    // 5th node should be on row 1 (0-indexed), col 0
    expect(fifthNode.position.x).toBe(20); // PADDING
    expect(fifthNode.position.y).toBeGreaterThan(20); // On second row
  });

  it("sorts steps by sequence", () => {
    const steps: LayoutStep[] = [
      { id: "s3", sequence: 3, actionTitle: "Step 3", fitStatus: "FIT", scopeItemId: "J60", processStepId: "ps3" },
      { id: "s1", sequence: 1, actionTitle: "Step 1", fitStatus: "FIT", scopeItemId: "J60", processStepId: "ps1" },
      { id: "s2", sequence: 2, actionTitle: "Step 2", fitStatus: "FIT", scopeItemId: "J60", processStepId: "ps2" },
    ];
    const result = computeSequentialLayout(steps);
    expect(result.nodes[0]!.stepSequence).toBe(1);
    expect(result.nodes[1]!.stepSequence).toBe(2);
    expect(result.nodes[2]!.stepSequence).toBe(3);
  });

  it("preserves step metadata in nodes", () => {
    const steps: LayoutStep[] = [
      { id: "s1", sequence: 1, actionTitle: "Create PO", fitStatus: "GAP", scopeItemId: "J60", processStepId: "ps1", clientNote: "Needs review" },
    ];
    const result = computeSequentialLayout(steps);
    const node = result.nodes[0]!;
    expect(node.label).toBe("Create PO");
    expect(node.fitStatus).toBe("GAP");
    expect(node.scopeItemId).toBe("J60");
    expect(node.processStepId).toBe("ps1");
    expect(node.clientNote).toBe("Needs review");
  });
});

describe("generateThumbnailSvg (Phase 20)", () => {
  it("returns a placeholder SVG for no steps", () => {
    const steps: LayoutStep[] = [];
    const layout = computeSequentialLayout(steps);
    const svg = generateThumbnailSvg(steps, layout);
    expect(svg).toContain("<svg");
    expect(svg).toContain("No steps");
  });

  it("generates valid SVG with nodes", () => {
    const steps: LayoutStep[] = [
      { id: "s1", sequence: 1, actionTitle: "Step 1", fitStatus: "FIT", scopeItemId: "J60", processStepId: "ps1" },
      { id: "s2", sequence: 2, actionTitle: "Step 2", fitStatus: "GAP", scopeItemId: "J60", processStepId: "ps2" },
    ];
    const layout = computeSequentialLayout(steps);
    const svg = generateThumbnailSvg(steps, layout);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("<rect");
    expect(svg).toContain("Step 1");
    expect(svg).toContain("Step 2");
    expect(svg).toContain("FIT");
    expect(svg).toContain("GAP");
  });

  it("keeps SVG under 10KB", () => {
    // Generate with 20 steps
    const steps: LayoutStep[] = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      sequence: i + 1,
      actionTitle: `Process Step ${i + 1}`,
      fitStatus: i % 3 === 0 ? "FIT" : i % 3 === 1 ? "GAP" : "CONFIGURE",
      scopeItemId: "J60",
      processStepId: `ps${i}`,
    }));
    const layout = computeSequentialLayout(steps);
    const svg = generateThumbnailSvg(steps, layout);
    expect(svg.length).toBeLessThan(10000);
  });

  it("escapes XML special characters", () => {
    const steps: LayoutStep[] = [
      { id: "s1", sequence: 1, actionTitle: "Create & Review <PO>", fitStatus: "FIT", scopeItemId: "J60", processStepId: "ps1" },
    ];
    const layout = computeSequentialLayout(steps);
    const svg = generateThumbnailSvg(steps, layout);
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&lt;");
    expect(svg).not.toContain("Create & Review <PO>");
  });
});
