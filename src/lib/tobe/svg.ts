/**
 * 2608 WS6 — the To-Be renderer. One renderer, plain SVG strings, no DOM:
 * the workbench page inlines them, the PDF/PPTX exports read the same layout
 * model (`layoutL2`) and draw it with their own primitives, and the snapshot
 * tests pin the markup.
 *
 * Tokens: design-system navy #002B5C for chrome; the four step states in
 * blue (STANDARD) · teal (CONFIGURED) · amber (VARIANT, GAP dashed) · gray
 * (NOT_IN_SCOPE). Hex literals, not CSS variables, because the same colours
 * must survive into PDF and PPTX where no stylesheet exists.
 *
 * Every text node is escaped; nothing from the client's answers reaches the
 * markup unescaped.
 */
import type { TobeChainDoc, TobePackDoc, TobeScopeItemDoc, TobeStepDoc, TobeStepState } from "./types";

export const TOBE_NAVY = "#002B5C";
export const TOBE_INK = "#1F1F1F";
export const TOBE_MUTED = "#6B6B6B";
export const TOBE_PAPER = "#FFFFFF";
export const TOBE_LANE = "#F6F7F9";

export const STATE_STYLE: Record<TobeStepState, { fill: string; stroke: string; label: string; dash?: string }> = {
  STANDARD: { fill: "#E0EBF4", stroke: "#1A4D6F", label: "Standard" },
  CONFIGURED: { fill: "#D9F0EC", stroke: "#0F766E", label: "Configured (SSCUI)" },
  VARIANT: { fill: "#FBE9D1", stroke: "#8B5A00", label: "Variant" },
  GAP: { fill: "#FBE9D1", stroke: "#8B5A00", label: "Gap", dash: "5 3" },
  NOT_IN_SCOPE: { fill: "#F1F1F1", stroke: "#8A8A8A", label: "Not in scope" },
};

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy word wrap to at most `lines` lines of ~`chars` characters; the last line is ellipsised. */
export function wrapText(text: string, chars: number, lines: number): string[] {
  // A single word longer than the line is split into line-sized pieces rather
  // than dropped — SAP step names carry long hyphenated terms.
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (w.length > chars ? (w.match(new RegExp(`.{1,${chars}}`, "g")) ?? [w]) : [w]));
  const out: string[] = [];
  let cur = "";
  let overflow = false;
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > chars && cur) {
      out.push(cur);
      cur = w;
      if (out.length === lines) {
        overflow = true;
        break;
      }
    } else cur = next;
  }
  if (!overflow && cur) out.push(cur);
  if (overflow) {
    const last = out[lines - 1]!;
    out[lines - 1] = last.length + 1 > chars ? `${last.slice(0, Math.max(0, chars - 1))}…` : `${last}…`;
  }
  return out.length ? out : [""];
}

// ── Layout model (shared by SVG, PDF and PPTX) ────────────────────────────────

export interface L2Lane {
  role: string;
  index: number;
}
export interface L2Node {
  step: TobeStepDoc;
  lane: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface L2Layout {
  code: string;
  title: string;
  lanes: L2Lane[];
  nodes: L2Node[];
  width: number;
  height: number;
  laneHeight: number;
  laneLabelWidth: number;
  headerHeight: number;
  colWidth: number;
  boxW: number;
  boxH: number;
}

export const L2_BOX_W = 132;
export const L2_BOX_H = 56;
export const L2_COL_W = 152;
export const L2_LANE_H = 88;
export const L2_LANE_LABEL_W = 150;
export const L2_HEADER_H = 64;
const UNASSIGNED = "Role not named in BPD";

/** Swimlane layout: lanes = roles in first-seen order; one column per step in BPD order. */
export function layoutL2(item: TobeScopeItemDoc): L2Layout {
  const roles: string[] = [];
  for (const s of item.steps) {
    const r = s.role || UNASSIGNED;
    if (!roles.includes(r)) roles.push(r);
  }
  if (roles.length === 0) roles.push(UNASSIGNED);
  const lanes = roles.map((role, index) => ({ role, index }));
  const nodes: L2Node[] = item.steps.map((step, col) => {
    const lane = roles.indexOf(step.role || UNASSIGNED);
    return {
      step,
      lane,
      col,
      x: L2_LANE_LABEL_W + col * L2_COL_W + (L2_COL_W - L2_BOX_W) / 2,
      y: L2_HEADER_H + lane * L2_LANE_H + (L2_LANE_H - L2_BOX_H) / 2,
      w: L2_BOX_W,
      h: L2_BOX_H,
    };
  });
  return {
    code: item.code,
    title: item.title,
    lanes,
    nodes,
    width: L2_LANE_LABEL_W + Math.max(1, item.steps.length) * L2_COL_W + 16,
    height: L2_HEADER_H + lanes.length * L2_LANE_H + 40,
    laneHeight: L2_LANE_H,
    laneLabelWidth: L2_LANE_LABEL_W,
    headerHeight: L2_HEADER_H,
    colWidth: L2_COL_W,
    boxW: L2_BOX_W,
    boxH: L2_BOX_H,
  };
}

function legendSvg(x: number, y: number): string {
  let lx = x;
  const parts: string[] = [];
  for (const state of Object.keys(STATE_STYLE) as TobeStepState[]) {
    const st = STATE_STYLE[state];
    parts.push(
      `<rect x="${lx}" y="${y - 9}" width="12" height="12" rx="2" fill="${st.fill}" stroke="${st.stroke}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`,
    );
    parts.push(`<text x="${lx + 16}" y="${y + 1}" font-size="10" fill="${TOBE_MUTED}">${escapeXml(st.label)}</text>`);
    lx += 22 + st.label.length * 5.6 + 12;
  }
  return parts.join("");
}

const FONT = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"`;

/** L2 — scope-item swimlane. */
export function renderL2Svg(item: TobeScopeItemDoc, opts: { title?: string } = {}): string {
  const L = layoutL2(item);
  const p: string[] = [];
  p.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" role="img" aria-labelledby="l2-${escapeXml(item.code)}-title" ${FONT}>`,
  );
  p.push(
    `<title id="l2-${escapeXml(item.code)}-title">${escapeXml(`${item.code} — ${item.title}: to-be swimlane, ${item.steps.length} steps`)}</title>`,
  );
  p.push(`<rect width="100%" height="100%" fill="${TOBE_PAPER}"/>`);
  p.push(`<rect x="0" y="0" width="${L.width}" height="${L.headerHeight - 22}" fill="${TOBE_NAVY}"/>`);
  p.push(
    `<text x="14" y="19" font-size="14" font-weight="700" fill="#FFFFFF">${escapeXml(opts.title ?? `${item.code} · ${item.title}`)}</text>`,
  );
  const sub = item.inScope
    ? `${item.steps.length} steps · ${item.configurations.length} configuration(s) · ${item.gaps.length} gap(s)${item.confirmInWorkshop ? " · confirm in workshop" : ""}`
    : "not in scope";
  p.push(`<text x="14" y="${L.headerHeight - 28}" font-size="9.5" fill="#CFD7E0">${escapeXml(sub)}</text>`);
  p.push(legendSvg(14, L.headerHeight - 6));
  // Lanes
  for (const lane of L.lanes) {
    const y = L.headerHeight + lane.index * L.laneHeight;
    p.push(
      `<rect x="0" y="${y}" width="${L.width}" height="${L.laneHeight}" fill="${lane.index % 2 === 0 ? TOBE_LANE : TOBE_PAPER}"/>`,
    );
    p.push(`<line x1="0" y1="${y}" x2="${L.width}" y2="${y}" stroke="#E3E6EA"/>`);
    const lines = wrapText(lane.role, 22, 3);
    lines.forEach((ln, i) =>
      p.push(
        `<text x="12" y="${y + 22 + i * 13}" font-size="11" font-weight="600" fill="${TOBE_NAVY}">${escapeXml(ln)}</text>`,
      ),
    );
  }
  p.push(
    `<line x1="${L.laneLabelWidth}" y1="${L.headerHeight}" x2="${L.laneLabelWidth}" y2="${L.height - 40}" stroke="#CFD7E0"/>`,
  );
  // Connectors
  for (let i = 1; i < L.nodes.length; i++) {
    const a = L.nodes[i - 1]!;
    const b = L.nodes[i]!;
    const ax = a.x + a.w;
    const ay = a.y + a.h / 2;
    const bx = b.x;
    const by = b.y + b.h / 2;
    const midX = ax + (bx - ax) / 2;
    p.push(
      `<path d="M${ax} ${ay} H${midX} V${by} H${bx}" fill="none" stroke="#8A97A6" stroke-width="1.2" marker-end="url(#arrow-${escapeXml(item.code)})"/>`,
    );
  }
  p.push(
    `<defs><marker id="arrow-${escapeXml(item.code)}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#8A97A6"/></marker></defs>`,
  );
  // Nodes
  for (const n of L.nodes) {
    const st = STATE_STYLE[n.step.state];
    const dash = st.dash ? ` stroke-dasharray="${st.dash}"` : n.step.optional ? ` stroke-dasharray="2 2"` : "";
    p.push(`<g role="listitem" data-step="${n.step.index}" data-state="${n.step.state}">`);
    p.push(
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" fill="${st.fill}" stroke="${st.stroke}" stroke-width="1.4"${dash}/>`,
    );
    const name = wrapText(n.step.name, 21, 2);
    name.forEach((ln, i) =>
      p.push(
        `<text x="${n.x + 8}" y="${n.y + 17 + i * 13}" font-size="10.5" font-weight="600" fill="${TOBE_INK}">${escapeXml(`${i === 0 ? `${n.step.index}. ` : ""}${ln}`)}</text>`,
      ),
    );
    const meta = n.step.sscuiId
      ? `SSCUI ${n.step.sscuiId}`
      : n.step.app
        ? wrapText(n.step.app, 23, 1)[0]!
        : n.step.optional
          ? "optional"
          : "";
    if (meta)
      p.push(`<text x="${n.x + 8}" y="${n.y + n.h - 8}" font-size="9" fill="${TOBE_MUTED}">${escapeXml(meta)}</text>`);
    if (n.step.confirmInWorkshop)
      p.push(
        `<circle cx="${n.x + n.w - 9}" cy="${n.y + 9}" r="4" fill="#8B5A00"><title>confirm in workshop</title></circle>`,
      );
    p.push(`</g>`);
  }
  p.push(
    `<text x="14" y="${L.height - 14}" font-size="9" fill="${TOBE_MUTED}">${escapeXml(`Evidence: scope ${item.code} · BPD ${item.release.match(/\d{4}/)?.[0] ?? ""} · dashed = optional in BPD · dot = confirm in workshop`)}</text>`,
  );
  p.push(`</svg>`);
  return p.join("");
}

/** L1 — end-to-end chain per value stream. */
export function renderL1Svg(doc: TobePackDoc, opts: { title?: string } = {}): string {
  const chains = doc.chains.length > 0 ? doc.chains : [pseudoChain(doc)];
  const boxW = 168;
  const boxH = 74;
  const gap = 46;
  const rowH = 150;
  const maxLen = Math.max(...chains.map((c) => c.items.length));
  const width = 40 + maxLen * boxW + (maxLen - 1) * gap;
  const height = 56 + chains.length * rowH;
  const p: string[] = [];
  p.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="l1-title" ${FONT}>`,
  );
  p.push(
    `<title id="l1-title">${escapeXml(opts.title ?? `End-to-end to-be chains · SAP content release ${doc.release}`)}</title>`,
  );
  p.push(`<rect width="100%" height="100%" fill="${TOBE_PAPER}"/>`);
  p.push(
    `<text x="20" y="26" font-size="15" font-weight="700" fill="${TOBE_NAVY}">${escapeXml(opts.title ?? "End-to-end to-be process (L1)")}</text>`,
  );
  p.push(legendSvg(20, 46));
  p.push(
    `<defs><marker id="l1-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 z" fill="${TOBE_NAVY}"/></marker></defs>`,
  );
  chains.forEach((chain, ci) => {
    const y = 70 + ci * rowH;
    p.push(
      `<text x="20" y="${y - 6}" font-size="11" font-weight="600" fill="${TOBE_MUTED}">${escapeXml(`${chain.name} · ${chain.valueStreamId}`)}</text>`,
    );
    chain.items.forEach((it, i) => {
      const x = 20 + i * (boxW + gap);
      const total = Object.values(it.counts).reduce((a, b) => a + b, 0);
      p.push(`<g data-scope="${escapeXml(it.code)}" data-in-scope="${it.inScope}">`);
      p.push(
        `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="8" fill="${it.inScope ? TOBE_PAPER : "#F1F1F1"}" stroke="${it.inScope ? TOBE_NAVY : "#8A8A8A"}" stroke-width="1.6"/>`,
      );
      p.push(
        `<text x="${x + 10}" y="${y + 20}" font-size="12" font-weight="700" fill="${it.inScope ? TOBE_NAVY : "#6B6B6B"}">${escapeXml(it.code)}</text>`,
      );
      wrapText(it.title, 24, 2).forEach((ln, li) =>
        p.push(`<text x="${x + 10}" y="${y + 35 + li * 12}" font-size="10" fill="${TOBE_INK}">${escapeXml(ln)}</text>`),
      );
      // State bar
      let bx = x + 10;
      const barW = boxW - 20;
      if (total > 0) {
        for (const state of Object.keys(STATE_STYLE) as TobeStepState[]) {
          const w = (it.counts[state] / total) * barW;
          if (w <= 0) continue;
          p.push(
            `<rect x="${bx.toFixed(1)}" y="${y + boxH - 12}" width="${w.toFixed(1)}" height="6" fill="${STATE_STYLE[state].stroke}"><title>${escapeXml(`${STATE_STYLE[state].label}: ${it.counts[state]} of ${total} steps`)}</title></rect>`,
          );
          bx += w;
        }
      } else {
        p.push(`<text x="${x + 10}" y="${y + boxH - 7}" font-size="9" fill="${TOBE_MUTED}">no BPD steps</text>`);
      }
      p.push(`</g>`);
      if (i < chain.items.length - 1)
        p.push(
          `<line x1="${x + boxW}" y1="${y + boxH / 2}" x2="${x + boxW + gap - 2}" y2="${y + boxH / 2}" stroke="${TOBE_NAVY}" stroke-width="1.6" marker-end="url(#l1-arrow)"/>`,
        );
    });
    chain.alternates.forEach((alt, ai) => {
      const fromIdx = chain.items.findIndex((it) => it.code === alt.from);
      const toIdx = chain.items.findIndex((it) => it.code === alt.to);
      const ay = y + boxH + 22 + ai * 24;
      const x1 = 20 + Math.max(fromIdx, 0) * (boxW + gap) + boxW / 2;
      const x2 = 20 + Math.max(toIdx, 0) * (boxW + gap) + boxW / 2;
      p.push(
        `<path d="M${x1} ${y + boxH} V${ay} H${x2} V${y + boxH + 2}" fill="none" stroke="${alt.inScope ? "#8B5A00" : "#8A8A8A"}" stroke-width="1.2" stroke-dasharray="4 3"/>`,
      );
      const tx = Math.min(x1, x2) + 8;
      const maxChars = Math.max(20, Math.floor((width - tx - 12) / 5.2));
      const note = wrapText(
        `alternate via ${alt.via.join(" → ")}${alt.inScope ? "" : " (not in scope)"}: ${alt.note}`,
        maxChars,
        1,
      )[0]!;
      p.push(
        `<text x="${tx}" y="${ay - 4}" font-size="9.5" fill="${alt.inScope ? "#8B5A00" : "#8A8A8A"}"><title>${escapeXml(alt.note)}</title>${escapeXml(note)}</text>`,
      );
    });
  });
  p.push(`</svg>`);
  return p.join("");
}

/** When no chain names the scope set, L1 is the scope items in order — still SAP's items, still their counts. */
function pseudoChain(doc: TobePackDoc): TobeChainDoc {
  return {
    id: "scope-order",
    name: "Selected scope items (no end-to-end chain defined)",
    valueStreamId: "—",
    source: "bundle scope order",
    items: doc.scopeItems
      .filter((s) => s.inScope)
      .map((s) => ({ code: s.code, title: s.title, inScope: true, counts: s.counts })),
    alternates: [],
  };
}

// ── L3 rows (table fallback, PDF, PPTX notes) ─────────────────────────────────

export interface L3Row {
  index: number;
  step: string;
  role: string;
  app: string;
  state: TobeStepState;
  stateLabel: string;
  marker: string;
  sscui: string;
  expected: string;
  evidence: string;
}

export function l3Rows(item: TobeScopeItemDoc): L3Row[] {
  const rel = item.release.match(/\d{4}/)?.[0] ?? "";
  return item.steps.map((s) => ({
    index: s.index,
    step: s.name,
    role: s.role || "—",
    app: s.app || "—",
    state: s.state,
    stateLabel: STATE_STYLE[s.state].label,
    marker: [
      s.optional ? "optional in BPD" : "",
      s.confirmInWorkshop ? "confirm in workshop" : "",
      s.gapType ? `gap: ${s.gapType}` : s.state === "GAP" ? "gap: unclassified" : "",
      s.alternatePathId ? `variant: ${s.alternatePathId}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    sscui: s.sscuiId ? `${s.sscuiId}${s.sscuiName ? ` ${s.sscuiName}` : ""}` : "—",
    expected: s.expected || "—",
    evidence: [
      `scope ${item.code}`,
      `BPD ${rel}`,
      s.sscuiId ? `SSCUI ${s.sscuiId}` : null,
      s.questionIds.length ? `BDC ${s.questionIds.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}
