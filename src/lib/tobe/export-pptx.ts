/**
 * 2608 WS6 — To-Be Process Pack as PPTX (pptxgenjs, native shapes): a title
 * slide, the L1 chain as the section opener, then one slide per L2 flow drawn
 * from the shared `layoutL2` model, with the L3 evidence in the speaker notes.
 * Same tokens as the SVG and the PDF.
 */
import PptxGenJS from "pptxgenjs";

import { STATE_STYLE, TOBE_NAVY, l3Rows, layoutL2, wrapText } from "./svg";
import type { TobePackDoc, TobeStepState } from "./types";

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const c = (h: string) => h.replace("#", "");

export async function generateTobePackPptx(
  doc: TobePackDoc,
  opts: { clientName: string; consultantView: boolean },
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = `To-Be Process Pack — ${opts.clientName}`;

  // Title
  const t = pptx.addSlide();
  t.background = { color: c(TOBE_NAVY) };
  t.addText("To-Be Process Pack", {
    x: 0.6,
    y: 2.2,
    w: 12,
    h: 1,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
    fontFace: "Helvetica",
  });
  t.addText(opts.clientName, { x: 0.6, y: 3.3, w: 12, h: 0.6, fontSize: 22, color: "FFFFFF", fontFace: "Helvetica" });
  t.addText(
    `SAP Cloud ERP (SAP S/4HANA Cloud Public Edition) · content release ${doc.release} · generated ${doc.generatedAt}`,
    { x: 0.6, y: 4.0, w: 12, h: 0.5, fontSize: 13, color: "CFD7E0", fontFace: "Helvetica" },
  );
  const s = doc.summary;
  t.addText(
    `${s.scopeItems} scope items · ${s.steps} steps · Standard ${s.byState.STANDARD} · Configured ${s.byState.CONFIGURED} · Variant ${s.byState.VARIANT} · Gap ${s.byState.GAP} · Not in scope ${s.byState.NOT_IN_SCOPE} · answers outside scope ${s.answersOutsideScope} · inputs ${doc.hashes.inputs.slice(0, 12)}`,
    { x: 0.6, y: 5.0, w: 12, h: 0.5, fontSize: 12, color: "FFFFFF", fontFace: "Helvetica" },
  );

  // L1 opener
  const chains = doc.chains.length
    ? doc.chains
    : [
        {
          id: "scope",
          name: "Selected scope items",
          valueStreamId: "—",
          source: "",
          items: doc.scopeItems
            .filter((i) => i.inScope)
            .map((i) => ({ code: i.code, title: i.title, inScope: true, counts: i.counts })),
          alternates: [],
        },
      ];
  const l1 = pptx.addSlide();
  l1.addText("End-to-end to-be process (L1)", {
    x: 0.4,
    y: 0.25,
    w: 12.5,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: c(TOBE_NAVY),
    fontFace: "Helvetica",
  });
  legend(l1, 0.4, 0.85);
  let cy = 1.5;
  for (const chain of chains) {
    l1.addText(`${chain.name} · ${chain.valueStreamId}`, {
      x: 0.4,
      y: cy,
      w: 12,
      h: 0.3,
      fontSize: 11,
      color: "6B6B6B",
      fontFace: "Helvetica",
    });
    cy += 0.35;
    const bw = 2.0;
    const bh = 1.05;
    const gap = 0.45;
    chain.items.forEach((it, i) => {
      const x = 0.4 + i * (bw + gap);
      l1.addShape("roundRect", {
        x,
        y: cy,
        w: bw,
        h: bh,
        fill: { color: it.inScope ? "FFFFFF" : "F1F1F1" },
        line: { color: it.inScope ? c(TOBE_NAVY) : "8A8A8A", width: 1.5 },
        rectRadius: 0.08,
      });
      l1.addText(
        [
          {
            text: it.code,
            options: { bold: true, fontSize: 12, color: it.inScope ? c(TOBE_NAVY) : "6B6B6B", breakLine: true },
          },
          { text: wrapText(it.title, 44, 2).join(" "), options: { fontSize: 9, color: "1F1F1F" } },
        ],
        { x: x + 0.08, y: cy + 0.05, w: bw - 0.16, h: bh - 0.3, valign: "top", fontFace: "Helvetica" },
      );
      const total = Object.values(it.counts).reduce((a, b) => a + b, 0);
      let bx = x + 0.1;
      if (total > 0)
        for (const state of Object.keys(STATE_STYLE) as TobeStepState[]) {
          const w = ((bw - 0.2) * it.counts[state]) / total;
          if (w <= 0) continue;
          l1.addShape("rect", {
            x: bx,
            y: cy + bh - 0.18,
            w,
            h: 0.08,
            fill: { color: c(STATE_STYLE[state].stroke) },
            line: { color: c(STATE_STYLE[state].stroke), width: 0 },
          });
          bx += w;
        }
      if (i < chain.items.length - 1)
        l1.addShape("line", {
          x: x + bw,
          y: cy + bh / 2,
          w: gap - 0.05,
          h: 0,
          line: { color: c(TOBE_NAVY), width: 1.5, endArrowType: "triangle" },
        });
    });
    cy += bh + 0.2;
    for (const alt of chain.alternates) {
      l1.addText(
        `alternate ${alt.from} → ${alt.via.join(" → ")} → ${alt.to}${alt.inScope ? "" : " (not in scope)"}: ${alt.note}`,
        { x: 0.4, y: cy, w: 12.5, h: 0.3, fontSize: 9, color: "8B5A00", fontFace: "Helvetica" },
      );
      cy += 0.3;
    }
    cy += 0.3;
  }

  // One slide per L2 flow
  for (const item of doc.scopeItems) {
    if (!item.inScope && !item.hasBpd) continue;
    const L = layoutL2(item);
    const sl = pptx.addSlide();
    sl.addShape("rect", {
      x: 0,
      y: 0,
      w: SLIDE_W,
      h: 0.75,
      fill: { color: c(TOBE_NAVY) },
      line: { color: c(TOBE_NAVY), width: 0 },
    });
    sl.addText(`${item.code} · ${item.title}`, {
      x: 0.3,
      y: 0.05,
      w: 12.7,
      h: 0.4,
      fontSize: 18,
      bold: true,
      color: "FFFFFF",
      fontFace: "Helvetica",
    });
    sl.addText(
      item.inScope
        ? `L2 swimlane · ${item.steps.length} steps · ${item.configurations.length} configuration(s) · ${item.gaps.length} gap(s)${item.confirmInWorkshop ? " · confirm in workshop" : ""}`
        : "not in scope",
      { x: 0.3, y: 0.42, w: 12.7, h: 0.3, fontSize: 10, color: "CFD7E0", fontFace: "Helvetica" },
    );
    legend(sl, 0.3, 0.82);
    const availW = SLIDE_W - 0.6;
    const availH = SLIDE_H - 1.6;
    const k = Math.min(availW / L.width, availH / (L.height - L.headerHeight - 40));
    const ox = 0.3;
    const oy = 1.15;
    const px = (v: number) => v * k;
    for (const lane of L.lanes) {
      const ly = oy + px(lane.index * L.laneHeight);
      sl.addShape("rect", {
        x: ox,
        y: ly,
        w: px(L.width),
        h: px(L.laneHeight),
        fill: { color: lane.index % 2 === 0 ? "F6F7F9" : "FFFFFF" },
        line: { color: "E3E6EA", width: 0.5 },
      });
      sl.addText(lane.role, {
        x: ox + 0.05,
        y: ly + 0.05,
        w: px(L.laneLabelWidth) - 0.1,
        h: px(L.laneHeight) - 0.1,
        fontSize: Math.max(7, Math.min(10, 34 * k)),
        bold: true,
        color: c(TOBE_NAVY),
        valign: "top",
        fontFace: "Helvetica",
      });
    }
    for (let i = 1; i < L.nodes.length; i++) {
      const a = L.nodes[i - 1]!;
      const b = L.nodes[i]!;
      const ax = ox + px(a.x + a.w);
      const ay = oy + px(a.y + a.h / 2 - L.headerHeight);
      const bx = ox + px(b.x);
      const by = oy + px(b.y + b.h / 2 - L.headerHeight);
      const mx = ax + (bx - ax) / 2;
      sl.addShape("line", { x: ax, y: ay, w: mx - ax, h: 0, line: { color: "8A97A6", width: 0.75 } });
      if (Math.abs(by - ay) > 0.001)
        sl.addShape("line", {
          x: mx,
          y: Math.min(ay, by),
          w: 0,
          h: Math.abs(by - ay),
          line: { color: "8A97A6", width: 0.75 },
        });
      sl.addShape("line", {
        x: mx,
        y: by,
        w: bx - mx,
        h: 0,
        line: { color: "8A97A6", width: 0.75, endArrowType: "triangle" },
      });
    }
    for (const n of L.nodes) {
      const st = STATE_STYLE[n.step.state];
      sl.addShape("roundRect", {
        x: ox + px(n.x),
        y: oy + px(n.y - L.headerHeight),
        w: px(n.w),
        h: px(n.h),
        fill: { color: c(st.fill) },
        line: { color: c(st.stroke), width: 1, dashType: st.dash ? "dash" : n.step.optional ? "sysDot" : "solid" },
        rectRadius: 0.05,
      });
      const meta = n.step.sscuiId ? `SSCUI ${n.step.sscuiId}` : n.step.app || "";
      sl.addText(
        [
          {
            text: `${n.step.index}. ${n.step.name}`,
            options: { bold: true, fontSize: Math.max(6, Math.min(9, 30 * k)), color: "1F1F1F", breakLine: true },
          },
          { text: meta, options: { fontSize: Math.max(5.5, Math.min(8, 26 * k)), color: "6B6B6B" } },
        ],
        {
          x: ox + px(n.x) + 0.03,
          y: oy + px(n.y - L.headerHeight) + 0.02,
          w: px(n.w) - 0.06,
          h: px(n.h) - 0.04,
          valign: "top",
          fontFace: "Helvetica",
          margin: 2,
        },
      );
    }
    const notes = l3Rows(item).map(
      (r) =>
        `${r.index}. ${r.step} — ${r.stateLabel}${r.marker ? ` (${r.marker})` : ""} · role ${r.role} · app ${r.app} · SSCUI ${r.sscui} · ${r.evidence}`,
    );
    const extra = [
      ...item.configurations.map(
        (cf) =>
          `Configured: SSCUI ${cf.sscuiId}${cf.sscuiName ? ` ${cf.sscuiName}` : ""} · BDC ${cf.questionId} (${cf.choice})${cf.scopeWide ? " · scope-wide" : ` · steps ${cf.stepNames.join(", ")}`}${cf.reason ? ` · "${cf.reason}"` : ""}`,
      ),
      ...item.gaps.map(
        (g) =>
          `Gap (${g.gapType ?? "unclassified — confirm in workshop"}): BDC ${g.questionId}${g.reason ? ` · "${g.reason}"` : ""}`,
      ),
      ...(opts.consultantView && doc.consultantNotes?.[item.code]
        ? [`Consultant note (internal): ${doc.consultantNotes[item.code]}`]
        : []),
    ];
    sl.addNotes([...notes, ...extra].join("\n"));
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}

function legend(slide: PptxGenJS.Slide, x: number, y: number): void {
  let lx = x;
  for (const state of Object.keys(STATE_STYLE) as TobeStepState[]) {
    const st = STATE_STYLE[state];
    slide.addShape("rect", {
      x: lx,
      y,
      w: 0.18,
      h: 0.18,
      fill: { color: c(st.fill) },
      line: { color: c(st.stroke), width: 0.75, dashType: st.dash ? "dash" : "solid" },
    });
    slide.addText(st.label, {
      x: lx + 0.22,
      y: y - 0.06,
      w: 1.9,
      h: 0.3,
      fontSize: 9,
      color: "6B6B6B",
      fontFace: "Helvetica",
    });
    lx += 0.22 + st.label.length * 0.075 + 0.35;
  }
}
