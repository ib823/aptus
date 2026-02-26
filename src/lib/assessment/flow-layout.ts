/** Phase 20: Flow layout computation and thumbnail generation */

import type { FlowNode, FlowEdge, FlowPosition } from "@/types/flow";

/** Input step for layout computation */
export interface LayoutStep {
  id: string;
  sequence: number;
  actionTitle: string;
  fitStatus: string;
  scopeItemId: string;
  processStepId: string;
  clientNote?: string | undefined;
}

/** Layout result */
export interface LayoutResult {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewBox: { width: number; height: number };
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const H_GAP = 40;
const V_GAP = 30;
const NODES_PER_ROW = 4;
const PADDING = 20;

/**
 * @deprecated Use computeHierarchicalLayout() instead for activity-aware layouts.
 * Retained for existing flow diagram routes. Remove after May 2026.
 *
 * Compute sequential layout positions for process steps.
 * Arranges nodes in rows of NODES_PER_ROW, wrapping to the next row.
 */
export function computeSequentialLayoutLegacy(steps: LayoutStep[]): LayoutResult {
  if (steps.length === 0) {
    return { nodes: [], edges: [], viewBox: { width: 0, height: 0 } };
  }

  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);

  const nodes: FlowNode[] = sorted.map((step, index) => {
    const col = index % NODES_PER_ROW;
    const row = Math.floor(index / NODES_PER_ROW);
    const position: FlowPosition = {
      x: PADDING + col * (NODE_WIDTH + H_GAP),
      y: PADDING + row * (NODE_HEIGHT + V_GAP),
    };

    return {
      id: `node-${step.id}`,
      label: step.actionTitle,
      fitStatus: step.fitStatus,
      position,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      stepSequence: step.sequence,
      scopeItemId: step.scopeItemId,
      processStepId: step.processStepId,
      actionTitle: step.actionTitle,
      clientNote: step.clientNote,
    };
  });

  const edges: FlowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const source = nodes[i];
    const target = nodes[i + 1];
    if (source && target) {
      edges.push({
        id: `edge-${source.id}-${target.id}`,
        sourceId: source.id,
        targetId: target.id,
      });
    }
  }

  const maxCol = Math.min(sorted.length, NODES_PER_ROW);
  const maxRow = Math.ceil(sorted.length / NODES_PER_ROW);
  const viewBox = {
    width: PADDING * 2 + maxCol * NODE_WIDTH + (maxCol - 1) * H_GAP,
    height: PADDING * 2 + maxRow * NODE_HEIGHT + (maxRow - 1) * V_GAP,
  };

  return { nodes, edges, viewBox };
}

/** @deprecated Alias for computeSequentialLayoutLegacy. Use computeHierarchicalLayout() instead. */
export const computeSequentialLayout = computeSequentialLayoutLegacy;

/** Color map for fit status in SVG thumbnails */
const STATUS_COLORS: Record<string, string> = {
  FIT: "#22c55e",
  CONFIGURE: "#3b82f6",
  GAP: "#f59e0b",
  NA: "#9ca3af",
  PENDING: "#d1d5db",
};

/**
 * Generate a simplified SVG thumbnail (under 10KB) from steps and layout.
 * Returns a self-contained SVG string.
 */
export function generateThumbnailSvg(
  steps: LayoutStep[],
  layout: LayoutResult,
): string {
  if (layout.nodes.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="10" y="25" font-size="12" fill="#999">No steps</text></svg>';
  }

  const { viewBox } = layout;
  const lines: string[] = [];

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox.width} ${viewBox.height}" width="${Math.min(viewBox.width, 800)}" height="${Math.min(viewBox.height, 600)}">`,
  );
  lines.push('<style>text{font-family:sans-serif;font-size:9px;fill:#333}</style>');

  // Draw edges
  for (const edge of layout.edges) {
    const source = layout.nodes.find((n) => n.id === edge.sourceId);
    const target = layout.nodes.find((n) => n.id === edge.targetId);
    if (source && target) {
      const sx = source.position.x + source.width;
      const sy = source.position.y + source.height / 2;
      const tx = target.position.x;
      const ty = target.position.y + target.height / 2;

      // If same row, draw straight line; if different row, draw L-shaped
      if (Math.abs(sy - ty) < 5) {
        lines.push(`<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#ccc" stroke-width="1.5" marker-end="url(#arrow)"/>`);
      } else {
        const mx = sx + H_GAP / 2;
        lines.push(`<polyline points="${sx},${sy} ${mx},${sy} ${mx},${ty} ${tx},${ty}" fill="none" stroke="#ccc" stroke-width="1.5" marker-end="url(#arrow)"/>`);
      }
    }
  }

  // Arrow marker
  lines.push('<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#ccc"/></marker></defs>');

  // Draw nodes
  for (const node of layout.nodes) {
    const color = STATUS_COLORS[node.fitStatus] ?? STATUS_COLORS.PENDING;
    const { x, y } = node.position;
    lines.push(`<rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="6" fill="${color}" opacity="0.15" stroke="${color}" stroke-width="1.5"/>`);
    // Truncate label to fit
    const maxChars = 22;
    const truncated = node.label.length > maxChars ? node.label.slice(0, maxChars - 1) + "\u2026" : node.label;
    lines.push(`<text x="${x + 8}" y="${y + 25}" fill="#333">${escapeXml(truncated)}</text>`);
    lines.push(`<text x="${x + 8}" y="${y + 42}" fill="${color}" font-weight="bold" font-size="8">${escapeXml(node.fitStatus)}</text>`);
  }

  lines.push("</svg>");
  return lines.join("\n");
}

/** Input step with activity context for hierarchical layout */
export interface HierarchicalLayoutStep extends LayoutStep {
  activityId: string | null;
  activityTitle: string | null;
}

/** Hierarchical layout result with activity sections */
export interface HierarchicalLayoutResult extends LayoutResult {
  activitySections: ActivitySection[];
}

export interface ActivitySection {
  activityId: string;
  activityTitle: string;
  bounds: { x: number; y: number; width: number; height: number };
  nodeIds: string[];
}

const SECTION_PADDING = 15;
const SECTION_HEADER_HEIGHT = 28;

/**
 * Compute hierarchical layout positions grouped by activity.
 * Each activity gets its own labeled section.
 */
export function computeHierarchicalLayout(steps: HierarchicalLayoutStep[]): HierarchicalLayoutResult {
  if (steps.length === 0) {
    return { nodes: [], edges: [], viewBox: { width: 0, height: 0 }, activitySections: [] };
  }

  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);

  // Group by activity
  const groups = new Map<string, { title: string; steps: HierarchicalLayoutStep[] }>();
  const groupOrder: string[] = [];
  for (const step of sorted) {
    const key = step.activityId ?? "__ungrouped__";
    if (!groups.has(key)) {
      groupOrder.push(key);
      groups.set(key, { title: step.activityTitle ?? "Process Steps", steps: [] });
    }
    groups.get(key)!.steps.push(step);
  }

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const activitySections: ActivitySection[] = [];
  let currentY = PADDING;

  for (const key of groupOrder) {
    const group = groups.get(key)!;
    const sectionStartY = currentY;

    // Section header space
    currentY += SECTION_HEADER_HEIGHT;

    const sectionNodes: string[] = [];

    for (let i = 0; i < group.steps.length; i++) {
      const step = group.steps[i]!;
      const col = i % NODES_PER_ROW;
      const row = Math.floor(i / NODES_PER_ROW);
      const position: FlowPosition = {
        x: PADDING + SECTION_PADDING + col * (NODE_WIDTH + H_GAP),
        y: currentY + row * (NODE_HEIGHT + V_GAP),
      };

      const node: FlowNode = {
        id: `node-${step.id}`,
        label: step.actionTitle,
        fitStatus: step.fitStatus,
        position,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        stepSequence: step.sequence,
        scopeItemId: step.scopeItemId,
        processStepId: step.processStepId,
        actionTitle: step.actionTitle,
        clientNote: step.clientNote,
      };
      nodes.push(node);
      sectionNodes.push(node.id);
    }

    // Connect nodes within this group
    for (let i = 0; i < sectionNodes.length - 1; i++) {
      edges.push({
        id: `edge-${sectionNodes[i]}-${sectionNodes[i + 1]}`,
        sourceId: sectionNodes[i]!,
        targetId: sectionNodes[i + 1]!,
      });
    }

    const rows = Math.ceil(group.steps.length / NODES_PER_ROW);
    const sectionHeight = SECTION_HEADER_HEIGHT + rows * (NODE_HEIGHT + V_GAP) + SECTION_PADDING;
    const sectionWidth = SECTION_PADDING * 2 + Math.min(group.steps.length, NODES_PER_ROW) * NODE_WIDTH + (Math.min(group.steps.length, NODES_PER_ROW) - 1) * H_GAP;

    activitySections.push({
      activityId: key,
      activityTitle: group.title,
      bounds: {
        x: PADDING,
        y: sectionStartY,
        width: sectionWidth,
        height: sectionHeight,
      },
      nodeIds: sectionNodes,
    });

    currentY += rows * (NODE_HEIGHT + V_GAP) + SECTION_PADDING + V_GAP;
  }

  // Connect last node of each section to first node of next section
  for (let s = 0; s < activitySections.length - 1; s++) {
    const currentSection = activitySections[s]!;
    const nextSection = activitySections[s + 1]!;
    const lastNode = currentSection.nodeIds[currentSection.nodeIds.length - 1];
    const firstNode = nextSection.nodeIds[0];
    if (lastNode && firstNode) {
      edges.push({
        id: `edge-section-${lastNode}-${firstNode}`,
        sourceId: lastNode,
        targetId: firstNode,
      });
    }
  }

  const maxCol = Math.min(sorted.length, NODES_PER_ROW);
  const viewBox = {
    width: PADDING * 2 + SECTION_PADDING * 2 + maxCol * NODE_WIDTH + (maxCol - 1) * H_GAP,
    height: currentY + PADDING,
  };

  return { nodes, edges, viewBox, activitySections };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
