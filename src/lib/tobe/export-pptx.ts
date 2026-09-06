/**
 * 2608 WS6 — To-Be Process Pack as PPTX (pptxgenjs, native shapes): a title
 * slide, the L1 chain as the section opener, then one slide per L2 flow drawn
 * from the shared `layoutL2` model, with the L3 evidence in the speaker notes.
 * Same tokens as the SVG and the PDF.
 */
import PptxGenJS from "pptxgenjs";

import { packNarrative, type NarrativeBlock } from "./narrative";
import { STATE_STYLE, TOBE_NAVY, l3Rows, layoutL2, paginateL2, wrapText } from "./svg";
import type { TobePackDoc, TobeStepState } from "./types";

const SLIDE_W = 13.333;
/** Step rows per L3 slide — beyond this the table runs off the bottom. */
const L3_ROWS_PER_SLIDE = 12;
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

  // How to read this pack — the same words the PDF carries, so a caveat cannot
  // exist in one export and not the other.
  for (const block of packNarrative(doc, { clientName: opts.clientName })) narrativeSlide(pptx, block);

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

  // One slide per L2 flow — paginated, for the reason in export-pdf.ts: a whole
  // 55-step flow on one slide is a row of unreadable slivers on a projector.
  for (const item of doc.scopeItems) {
    if (!item.inScope && !item.hasBpd) continue;
    const pages = paginateL2(item);
    pages.forEach((slice, pageIndex) => {
      const L = layoutL2(slice);
      const sl = pptx.addSlide();
      sl.addShape("rect", {
        x: 0,
        y: 0,
        w: SLIDE_W,
        h: 0.75,
        fill: { color: c(TOBE_NAVY) },
        line: { color: c(TOBE_NAVY), width: 0 },
      });
      sl.addText(`${item.code} · ${item.title}${pages.length > 1 ? `  (${pageIndex + 1}/${pages.length})` : ""}`, {
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
          ? `L2 swimlane · ${pages.length > 1 ? `steps ${slice.steps[0]?.index}\u2013${slice.steps[slice.steps.length - 1]?.index} of ${item.steps.length}` : `${item.steps.length} steps`} · ${item.configurations.length} configuration(s) · ${item.gaps.length} gap(s)${item.confirmInWorkshop ? " · confirm in workshop" : ""}`
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
      const notes = l3Rows(slice).map(
        (r) =>
          `${r.index}. ${r.step} — ${r.stateLabel}${r.marker ? ` (${r.marker})` : ""} · role ${r.role} · app ${r.app} · SSCUI ${r.sscui} · ${r.evidence}`,
      );
      const extra =
        pageIndex < pages.length - 1
          ? []
          : [
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
    });

    /*
     * The step detail as a VISIBLE table, not only speaker notes. The PDF
     * carried the evidence and the PPTX hid it in the notes pane, so the deck
     * that actually gets presented was the thinner of the two.
     */
    const rows = l3Rows(item);
    for (let i = 0; i < rows.length; i += L3_ROWS_PER_SLIDE) {
      const chunk = rows.slice(i, i + L3_ROWS_PER_SLIDE);
      const ds = pptx.addSlide();
      slideHeader(
        ds,
        `${item.code} · ${item.title} — step detail (L3)`,
        rows.length > L3_ROWS_PER_SLIDE
          ? `steps ${chunk[0]!.index}\u2013${chunk[chunk.length - 1]!.index} of ${rows.length} · evidence per step`
          : `${rows.length} steps · evidence per step`,
      );
      ds.addTable(
        [
          ["#", "Step", "Role", "App", "State", "SSCUI", "Expected result", "Evidence"].map((t) => ({
            text: t,
            options: { bold: true, color: "FFFFFF", fill: { color: c(TOBE_NAVY) }, fontSize: 10 },
          })),
          ...chunk.map((r) => [
            { text: String(r.index), options: { fontSize: 9 } },
            { text: r.step + (r.marker ? `\n${r.marker}` : ""), options: { fontSize: 9 } },
            { text: r.role, options: { fontSize: 9 } },
            { text: r.app, options: { fontSize: 9 } },
            {
              text: r.stateLabel,
              options: {
                fontSize: 9,
                fill: { color: c(STATE_STYLE[r.state].fill) },
                color: c(STATE_STYLE[r.state].stroke),
              },
            },
            { text: r.sscui, options: { fontSize: 9 } },
            { text: r.expected, options: { fontSize: 8 } },
            { text: r.evidence, options: { fontSize: 8, color: "6B6B6B" } },
          ]),
        ],
        {
          x: 0.3,
          y: 0.95,
          w: 12.73,
          colW: [0.4, 2.5, 1.5, 1.7, 1.2, 1.9, 1.9, 1.63],
          border: { type: "solid", color: "E3E6EA", pt: 0.5 },
          valign: "top",
          fontFace: "Helvetica",
        },
      );
    }

    // Configurations and gaps, on the slide rather than only in the notes.
    if (item.configurations.length || item.gaps.length) {
      const cs = pptx.addSlide();
      slideHeader(
        cs,
        `${item.code} · ${item.title} — configurations and gaps`,
        `${item.configurations.length} configuration(s) · ${item.gaps.length} gap(s)`,
      );
      const body: PptxGenJS.TextProps[] = [];
      for (const cf of item.configurations)
        body.push({
          text: `Configured — SSCUI ${cf.sscuiId}${cf.sscuiName ? ` ${cf.sscuiName}` : ""} · from ${cf.questionId} (${cf.choice}) · ${cf.scopeWide ? "scope-wide" : `steps: ${cf.stepNames.join(", ")}`}${cf.reason ? ` — "${cf.reason}"` : ""}`,
          options: { fontSize: 12, bullet: true, color: c(STATE_STYLE.CONFIGURED.stroke), breakLine: true },
        });
      for (const g of item.gaps)
        body.push({
          text: `Gap (${g.gapType ?? "not yet classified — confirm in workshop"}) — from ${g.questionId}${g.reason ? ` — "${g.reason}"` : ""}`,
          options: { fontSize: 12, bullet: true, color: c(STATE_STYLE.GAP.stroke), breakLine: true },
        });
      cs.addText(body, { x: 0.5, y: 1.1, w: 12.4, h: 5.6, valign: "top", fontFace: "Helvetica" });
    }
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}

/** The navy title band every content slide carries. */
function slideHeader(slide: PptxGenJS.Slide, title: string, sub: string): void {
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.75,
    fill: { color: c(TOBE_NAVY) },
    line: { color: c(TOBE_NAVY), width: 0 },
  });
  slide.addText(title, {
    x: 0.3,
    y: 0.05,
    w: 12.7,
    h: 0.4,
    fontSize: 18,
    bold: true,
    color: "FFFFFF",
    fontFace: "Helvetica",
  });
  if (sub)
    slide.addText(sub, { x: 0.3, y: 0.42, w: 12.7, h: 0.3, fontSize: 10, color: "CFD7E0", fontFace: "Helvetica" });
}

/** One narrative block per slide: lead, bullets or table, then the footnote. */
function narrativeSlide(pptx: PptxGenJS, block: NarrativeBlock): void {
  const sl = pptx.addSlide();
  slideHeader(sl, block.heading, block.sub ?? "");
  let y = 1.0;
  if (block.lead) {
    sl.addText(block.lead, {
      x: 0.5,
      y,
      w: 12.4,
      h: 0.9,
      fontSize: 13,
      color: "1F1F1F",
      fontFace: "Helvetica",
      valign: "top",
    });
    y += 1.0;
  }
  if (block.bullets) {
    sl.addText(
      block.bullets.map((b) => ({ text: b, options: { fontSize: 11.5, bullet: true, breakLine: true } })),
      { x: 0.5, y, w: 12.4, h: 6.3 - y, color: "1F1F1F", fontFace: "Helvetica", valign: "top" },
    );
    y = 6.4;
  }
  if (block.table) {
    sl.addTable(
      [
        block.table.head.map((t) => ({
          text: t,
          options: { bold: true, color: "FFFFFF", fill: { color: c(TOBE_NAVY) }, fontSize: 11 },
        })),
        ...block.table.rows.map((r) => r.map((t) => ({ text: t, options: { fontSize: 10.5 } }))),
      ],
      {
        x: 0.5,
        y,
        w: 12.4,
        border: { type: "solid", color: "E3E6EA", pt: 0.5 },
        valign: "top",
        fontFace: "Helvetica",
      },
    );
    y += 0.6 + block.table.rows.length * 0.42;
  }
  if (block.footnote)
    sl.addText(block.footnote, {
      x: 0.5,
      y: Math.min(y, 6.7),
      w: 12.4,
      h: 0.6,
      fontSize: 9,
      color: "6B6B6B",
      fontFace: "Helvetica",
      valign: "top",
    });
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
