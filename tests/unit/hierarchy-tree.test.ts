import { describe, it, expect } from "vitest";
import type { HierarchyTree, ProcessNode, FlowNode, ActivityNode } from "@/types/hierarchy";

function createActivityNode(overrides: Partial<ActivityNode> = {}): ActivityNode {
  return {
    id: "act-1",
    title: "Post Invoice",
    guid: null,
    targetUrl: null,
    sequence: 0,
    stepCount: 10,
    classifiableCount: 10,
    reviewedCount: 0,
    fitCount: 0,
    configureCount: 0,
    gapCount: 0,
    naCount: 0,
    pendingCount: 10,
    ...overrides,
  };
}

function createFlowNode(overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: "flow-1",
    name: "AP Flow",
    guid: null,
    flowDiagramGuid: null,
    flowDiagramName: null,
    sequence: 0,
    activities: [createActivityNode()],
    ...overrides,
  };
}

function createProcessNode(overrides: Partial<ProcessNode> = {}): ProcessNode {
  return {
    id: "proc-1",
    name: "Invoice Processing",
    guid: null,
    sequence: 0,
    flows: [createFlowNode()],
    ...overrides,
  };
}

function createTree(overrides: Partial<HierarchyTree> = {}): HierarchyTree {
  return {
    scopeItemId: "J60",
    scopeItemName: "Accounts Payable",
    processes: [createProcessNode()],
    ...overrides,
  };
}

describe("HierarchyTree type structure", () => {
  it("creates a valid tree with all required fields", () => {
    const tree = createTree();
    expect(tree.scopeItemId).toBe("J60");
    expect(tree.scopeItemName).toBe("Accounts Payable");
    expect(tree.processes).toHaveLength(1);
  });

  it("nests processes > flows > activities correctly", () => {
    const tree = createTree();
    const process = tree.processes[0]!;
    expect(process.flows).toHaveLength(1);
    expect(process.flows[0]!.activities).toHaveLength(1);
    expect(process.flows[0]!.activities[0]!.title).toBe("Post Invoice");
  });

  it("tracks progress counts on ActivityNode", () => {
    const activity = createActivityNode({
      stepCount: 20,
      reviewedCount: 15,
      fitCount: 10,
      configureCount: 3,
      gapCount: 2,
      naCount: 0,
      pendingCount: 5,
    });
    expect(activity.reviewedCount).toBe(15);
    expect(activity.fitCount + activity.configureCount + activity.gapCount + activity.naCount).toBe(15);
    expect(activity.pendingCount).toBe(5);
  });

  it("handles synthetic entities for NULL names", () => {
    const tree = createTree({
      processes: [createProcessNode({
        name: "__main_process__",
        flows: [createFlowNode({
          name: "__main_flow__",
          activities: [createActivityNode({ title: "__main_activity__" })],
        })],
      })],
    });
    expect(tree.processes[0]!.name).toBe("__main_process__");
  });

  it("preserves ordering via sequence field", () => {
    const tree = createTree({
      processes: [
        createProcessNode({ id: "p1", sequence: 0 }),
        createProcessNode({ id: "p2", sequence: 1 }),
      ],
    });
    expect(tree.processes[0]!.id).toBe("p1");
    expect(tree.processes[1]!.id).toBe("p2");
  });

  it("handles empty tree (no processes)", () => {
    const tree = createTree({ processes: [] });
    expect(tree.processes).toHaveLength(0);
  });

  it("calculates total steps across activities", () => {
    const tree = createTree({
      processes: [createProcessNode({
        flows: [createFlowNode({
          activities: [
            createActivityNode({ stepCount: 10 }),
            createActivityNode({ id: "act-2", stepCount: 20 }),
          ],
        })],
      })],
    });
    const totalSteps = tree.processes[0]!.flows[0]!.activities.reduce((s, a) => s + a.stepCount, 0);
    expect(totalSteps).toBe(30);
  });

  it("allows multiple flows per process", () => {
    const tree = createTree({
      processes: [createProcessNode({
        flows: [
          createFlowNode({ id: "f1", name: "Flow A" }),
          createFlowNode({ id: "f2", name: "Flow B" }),
        ],
      })],
    });
    expect(tree.processes[0]!.flows).toHaveLength(2);
  });

  it("all completed when reviewedCount equals stepCount", () => {
    const activity = createActivityNode({
      stepCount: 10,
      reviewedCount: 10,
      fitCount: 8,
      configureCount: 2,
      pendingCount: 0,
    });
    expect(activity.pendingCount).toBe(0);
    expect(activity.reviewedCount).toBe(activity.stepCount);
  });

  it("handles large scope items with many activities", () => {
    const activities = Array.from({ length: 50 }, (_, i) =>
      createActivityNode({ id: `act-${i}`, title: `Activity ${i}`, stepCount: 40 }),
    );
    const tree = createTree({
      processes: [createProcessNode({
        flows: [createFlowNode({ activities })],
      })],
    });
    const total = tree.processes[0]!.flows[0]!.activities.reduce((s, a) => s + a.stepCount, 0);
    expect(total).toBe(2000);
  });
});
