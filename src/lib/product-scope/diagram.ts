import type { ScopeDetail } from "./detail";

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character] ?? character);
}

function wrap(value: string, max = 56): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

/** Aptus-generated diagram from imported ordered SAP activities, never invented nodes. */
export function renderScopeDiagram(detail: Pick<ScopeDetail, "code" | "title" | "steps">): string {
  if (detail.steps.length === 0) throw new Error("No source steps available for diagram");
  const width = 900;
  const rowHeight = 112;
  const height = 112 + detail.steps.length * rowHeight;
  const nodes = detail.steps.map((step, index) => {
    const y = 68 + index * rowHeight;
    const lines = wrap(step.title);
    const text = lines.map((line, lineIndex) => `<text x="148" y="${y + 32 + lineIndex * 18}" font-size="15" fill="#102a43">${escapeXml(line)}</text>`).join("");
    const role = step.role ? `<text x="148" y="${y + 93}" font-size="12" fill="#52657a">${escapeXml(step.role.slice(0, 90))}</text>` : "";
    const arrow = index < detail.steps.length - 1 ? `<path d="M450 ${y + 88} V${y + 108}" stroke="#54738b" stroke-width="2" marker-end="url(#arrow)"/>` : "";
    return `<g><rect x="100" y="${y}" width="700" height="88" rx="14" fill="#fff" stroke="#b9ccd8"/><circle cx="124" cy="${y + 43}" r="14" fill="#143b58"/><text x="124" y="${y + 48}" text-anchor="middle" font-size="12" fill="#fff">${step.sequence}</text>${text}${role}${arrow}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Process diagram for ${escapeXml(detail.code)}"><title>${escapeXml(detail.title)} — Aptus generated from imported SAP steps</title><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#54738b"/></marker></defs><rect width="100%" height="100%" fill="#f7f9fb"/><text x="100" y="40" font-size="20" font-weight="bold" fill="#143b58">${escapeXml(detail.code)} · ${escapeXml(detail.title.slice(0, 65))}</text>${nodes}<text x="100" y="${height - 10}" font-size="12" fill="#52657a">Aptus diagram · ordered imported SAP activities</text></svg>`;
}
