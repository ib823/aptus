/** Flow diagram SVG generation — sequential annotated flow diagrams */

const STATUS_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  FIT: { fill: "#dcfce7", stroke: "#16a34a", text: "#15803d" },
  CONFIGURE: { fill: "#dbeafe", stroke: "#2563eb", text: "#1d4ed8" },
  GAP: { fill: "#fef3c7", stroke: "#d97706", text: "#b45309" },
  NA: { fill: "#f3f4f6", stroke: "#9ca3af", text: "#6b7280" },
  PENDING: { fill: "#f3f4f6", stroke: "#d1d5db", text: "#9ca3af" },
};

interface FlowStep {
  id: string;
  sequence: number;
  actionTitle: string;
  stepType: string;
  fitStatus: string;
}

export function generateFlowSvg(
  flowName: string,
  scopeItemName: string,
  steps: FlowStep[],
): string {
  const nodeWidth = 180;
  const nodeHeight = 50;
  const gapX = 40;
  const gapY = 20;
  const nodesPerRow = 4;
  const padding = 30;
  const headerHeight = 60;

  const rows = Math.ceil(steps.length / nodesPerRow);
  const svgWidth = padding * 2 + nodesPerRow * nodeWidth + (nodesPerRow - 1) * gapX;
  const svgHeight = padding + headerHeight + rows * (nodeHeight + gapY) + padding;

  const parts: string[] = [];

  // SVG header
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`);
  parts.push(`<style>text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }</style>`);
  parts.push(`<rect width="100%" height="100%" fill="white"/>`);

  // Title
  parts.push(`<text x="${padding}" y="${padding + 16}" font-size="14" font-weight="bold" fill="#111827">${escapeXml(scopeItemName)}</text>`);
  parts.push(`<text x="${padding}" y="${padding + 34}" font-size="11" fill="#6b7280">${escapeXml(flowName)}</text>`);

  // Legend
  const legendX = svgWidth - padding - 400;
  let lx = legendX;
  for (const [status, colors] of Object.entries(STATUS_COLORS)) {
    parts.push(`<rect x="${lx}" y="${padding + 6}" width="12" height="12" rx="2" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1"/>`);
    parts.push(`<text x="${lx + 16}" y="${padding + 16}" font-size="9" fill="${colors.text}">${status}</text>`);
    lx += 70;
  }

  // Nodes
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    const col = i % nodesPerRow;
    const row = Math.floor(i / nodesPerRow);
    const x = padding + col * (nodeWidth + gapX);
    const y = padding + headerHeight + row * (nodeHeight + gapY);

    const colors = STATUS_COLORS[step.fitStatus] ?? STATUS_COLORS["PENDING"];
    if (!colors) continue;

    // Node box
    parts.push(`<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="6" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.5"/>`);

    // Step number
    parts.push(`<text x="${x + 8}" y="${y + 16}" font-size="9" fill="${colors.text}" font-weight="bold">${step.sequence}</text>`);

    // Step title (truncated)
    const title = step.actionTitle.length > 22 ? step.actionTitle.slice(0, 22) + "…" : step.actionTitle;
    parts.push(`<text x="${x + 8}" y="${y + 30}" font-size="10" fill="#111827">${escapeXml(title)}</text>`);

    // Status + type
    parts.push(`<text x="${x + 8}" y="${y + 42}" font-size="8" fill="${colors.text}">${step.fitStatus} · ${step.stepType}</text>`);

    // Arrow to next node (same row)
    if (i < steps.length - 1) {
      const nextCol = (i + 1) % nodesPerRow;
      if (nextCol > 0) {
        // Horizontal arrow
        const arrowX1 = x + nodeWidth;
        const arrowX2 = arrowX1 + gapX;
        const arrowY = y + nodeHeight / 2;
        parts.push(`<line x1="${arrowX1}" y1="${arrowY}" x2="${arrowX2 - 6}" y2="${arrowY}" stroke="#d1d5db" stroke-width="1.5" marker-end="url(#arrow)"/>`);
      } else {
        // Down + left arrow (wrap to next row)
        const arrowX1 = x + nodeWidth / 2;
        const arrowY1 = y + nodeHeight;
        const nextY = padding + headerHeight + (row + 1) * (nodeHeight + gapY);
        const nextX = padding;
        parts.push(`<path d="M ${arrowX1} ${arrowY1} L ${arrowX1} ${arrowY1 + gapY / 2} L ${nextX + nodeWidth / 2} ${arrowY1 + gapY / 2} L ${nextX + nodeWidth / 2} ${nextY - 4}" stroke="#d1d5db" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`);
      }
    }
  }

  // Arrow marker definition
  parts.push(`<defs><marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M 0 0 L 8 3 L 0 6 Z" fill="#d1d5db"/></marker></defs>`);

  parts.push("</svg>");
  return parts.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
