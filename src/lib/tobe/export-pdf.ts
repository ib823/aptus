/**
 * 2608 WS6 — To-Be Process Pack as PDF (jsPDF + autoTable, the report engine's
 * own stack). Landscape A4: cover · summary · L1 chains · per scope item an L2
 * swimlane page (drawn from the shared `layoutL2` model) and an L3 table.
 * Colours are the renderer's tokens, so PDF, PPTX and screen agree.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { packNarrative, type NarrativeBlock } from "./narrative";
import { STATE_STYLE, TOBE_NAVY, l3Rows, layoutL2, paginateL2, wrapText } from "./svg";
import type { TobePackDoc, TobeStepState } from "./types";

/*
 * jsPDF's built-in Helvetica is WinAnsi-encoded. A glyph outside that set is
 * not dropped — it derails the whole run, which is how one arrow in an L1 note
 * turned the line into letter-spaced rubble with `!'` where the arrow was.
 * SAP step names, gap reasons and client answers are free text, so the fix has
 * to be a choke point rather than one corrected string: every draw goes through
 * this. Characters WinAnsi does carry (en/em dash, middot, curly quotes) pass
 * through untouched.
 */
const WIN_ANSI_EXTRAS = "\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178";
const GLYPH_FALLBACK: Record<string, string> = {
  "\u2192": "->",
  "\u2190": "<-",
  "\u2194": "<->",
  "\u21D2": "=>",
  "\u2264": "<=",
  "\u2265": ">=",
  "\u2260": "!=",
  "\u00A0": " ",
  "\u2212": "-",
  "\u00D7": "x",
};

export function winAnsiSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x100 || WIN_ANSI_EXTRAS.includes(ch)) out += ch;
    else out += GLYPH_FALLBACK[ch] ?? "?";
  }
  return out;
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface TobePdfOptions {
  clientName: string;
  consultantView: boolean;
}

export function generateTobePackPdf(doc: TobePackDoc, opts: TobePdfOptions): Uint8Array {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  /*
   * One interception covers everything drawn — our own labels, autoTable's
   * cells and `splitTextToSize` output alike — so a stray glyph in SAP content
   * can never reach a client-facing page. jsPDF puts `text` on the instance,
   * not the prototype, so reassigning it here affects this document only.
   */
  const drawText = pdf.text.bind(pdf) as typeof pdf.text;
  pdf.text = ((txt: string | string[], ...rest: unknown[]) =>
    (drawText as (t: string | string[], ...r: unknown[]) => jsPDF)(
      Array.isArray(txt) ? txt.map(winAnsiSafe) : winAnsiSafe(String(txt)),
      ...rest,
    )) as typeof pdf.text;
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const navy = hex(TOBE_NAVY);

  // ── Cover
  pdf.setFillColor(...navy);
  pdf.rect(0, 0, pw, 64, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text("To-Be Process Pack", 20, 34);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.text(opts.clientName, 20, 46);
  pdf.text(`SAP Cloud ERP (SAP S/4HANA Cloud Public Edition) · content release ${doc.release}`, 20, 55);
  pdf.setTextColor(31, 31, 31);
  pdf.setFontSize(11);
  let y = 80;
  const s = doc.summary;
  const lines = [
    `Scope items: ${s.scopeItems}   ·   Steps: ${s.steps}   ·   Answered BDC questions: ${s.answered}   ·   Unanswered: ${s.unansweredQuestions}   ·   Answers outside scope: ${s.answersOutsideScope}`,
    `Standard ${s.byState.STANDARD}   ·   Configured ${s.byState.CONFIGURED}   ·   Variant ${s.byState.VARIANT}   ·   Gap ${s.byState.GAP}   ·   Not in scope ${s.byState.NOT_IN_SCOPE}`,
    `Configured SSCUIs: ${s.configuredSscuis}   ·   Gaps: ${s.gaps}   ·   Scope items to confirm in workshop: ${s.confirmInWorkshop}`,
    `Generated ${doc.generatedAt} · inputs ${doc.hashes.inputs.slice(0, 16)} · scope ${doc.hashes.scope.slice(0, 12)} · answers ${doc.hashes.answers.slice(0, 12)} · rules ${doc.hashes.rules.slice(0, 12)}`,
  ];
  for (const l of lines) {
    pdf.text(l, 20, y);
    y += 7;
  }
  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.text("Legend", 20, y);
  pdf.setFont("helvetica", "normal");
  y += 6;
  for (const state of Object.keys(STATE_STYLE) as TobeStepState[]) {
    const st = STATE_STYLE[state];
    pdf.setFillColor(...hex(st.fill));
    pdf.setDrawColor(...hex(st.stroke));
    pdf.rect(20, y - 3.5, 5, 4, "FD");
    pdf.text(st.label, 28, y);
    y += 6;
  }
  pdf.text(
    "Every step is a BPD 2608 step of its scope item; a CONFIGURED step names a real SSCUI id from the 2608 list; nothing is inferred.",
    20,
    y + 4,
  );

  // ── How to read this pack (context, caveats, provenance, effort drivers)
  for (const block of packNarrative(doc, { clientName: opts.clientName })) narrativePage(pdf, block, navy, pw, ph);

  // ── L1
  pdf.addPage();
  header(pdf, "End-to-end to-be process (L1)", `${doc.chains.length || 1} chain(s) · ${doc.release}`);
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
  let cy = 40;
  for (const chain of chains) {
    pdf.setFontSize(10);
    pdf.setTextColor(107, 107, 107);
    pdf.text(`${chain.name} · ${chain.valueStreamId}`, 18, cy);
    cy += 4;
    const bw = 46;
    const bh = 22;
    const gap = 10;
    chain.items.forEach((it, i) => {
      const x = 18 + i * (bw + gap);
      pdf.setDrawColor(...(it.inScope ? navy : hex("#8A8A8A")));
      pdf.setFillColor(...((it.inScope ? [255, 255, 255] : [241, 241, 241]) as [number, number, number]));
      pdf.setLineWidth(0.5);
      pdf.roundedRect(x, cy, bw, bh, 2, 2, "FD");
      pdf.setTextColor(...(it.inScope ? navy : hex("#6B6B6B")));
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(it.code, x + 3, cy + 6);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(31, 31, 31);
      wrapText(it.title, 26, 2).forEach((ln, li) => pdf.text(ln, x + 3, cy + 11 + li * 3.6));
      const total = Object.values(it.counts).reduce((a, b) => a + b, 0);
      let bx = x + 3;
      if (total > 0)
        for (const state of Object.keys(STATE_STYLE) as TobeStepState[]) {
          const w = ((bw - 6) * it.counts[state]) / total;
          if (w <= 0) continue;
          pdf.setFillColor(...hex(STATE_STYLE[state].stroke));
          pdf.rect(bx, cy + bh - 3.5, w, 1.8, "F");
          bx += w;
        }
      if (i < chain.items.length - 1) {
        pdf.setDrawColor(...navy);
        pdf.line(x + bw, cy + bh / 2, x + bw + gap - 1, cy + bh / 2);
      }
    });
    cy += bh + 6;
    for (const alt of chain.alternates) {
      pdf.setFontSize(8);
      pdf.setTextColor(...hex("#8B5A00"));
      pdf.text(
        `alternate ${alt.from} → ${alt.via.join(" → ")} → ${alt.to}${alt.inScope ? "" : " (not in scope)"}: ${alt.note}`,
        18,
        cy,
      );
      cy += 5;
    }
    cy += 8;
  }

  // ── Per scope item
  for (const item of doc.scopeItems) {
    if (!item.inScope && !item.hasBpd) continue;
    /*
     * PAGINATED, NOT SCALED TO FIT. One page held the whole flow, so a 55-step
     * item drew its boxes at 9% while the labels kept a fixed 6.5pt — the
     * diagram was present and unreadable, text piled on text. Slicing the flow
     * holds every page near a fifth scale; step numbers are global, so the
     * sequence still reads across pages.
     */
    const pages = paginateL2(item);
    pages.forEach((slice, pageIndex) => {
      pdf.addPage();
      const from = slice.steps[0]?.index;
      const to = slice.steps[slice.steps.length - 1]?.index;
      const range =
        pages.length > 1 && from && to ? `steps ${from}–${to} of ${item.steps.length}` : `${item.steps.length} steps`;
      header(
        pdf,
        `${item.code} · ${item.title}${pages.length > 1 ? `  (${pageIndex + 1}/${pages.length})` : ""}`,
        item.inScope
          ? `L2 swimlane · ${range} · ${item.configurations.length} configuration(s) · ${item.gaps.length} gap(s)${item.confirmInWorkshop ? " · confirm in workshop" : ""}`
          : "not in scope",
      );
      const L = layoutL2(slice);
      // Fit the layout to the page: scale px → mm.
      const availW = pw - 24;
      const availH = ph - 50;
      const k = Math.min(availW / L.width, availH / (L.height - 40), 0.35);
      const ox = 12;
      const oy = 34;
      pdf.setFontSize(7);
      for (const lane of L.lanes) {
        const ly = oy + (L.headerHeight + lane.index * L.laneHeight) * k - L.headerHeight * k;
        pdf.setFillColor(...((lane.index % 2 === 0 ? hex("#F6F7F9") : [255, 255, 255]) as [number, number, number]));
        pdf.rect(ox, ly, L.width * k, L.laneHeight * k, "F");
        pdf.setTextColor(...navy);
        pdf.setFont("helvetica", "bold");
        wrapText(lane.role, 22, 3).forEach((ln, li) => pdf.text(ln, ox + 2, ly + 4 + li * 3.2));
      }
      pdf.setFont("helvetica", "normal");
      for (let i = 1; i < L.nodes.length; i++) {
        const a = L.nodes[i - 1]!;
        const b = L.nodes[i]!;
        pdf.setDrawColor(138, 151, 166);
        pdf.setLineWidth(0.3);
        const ax = ox + (a.x + a.w) * k;
        const ay = oy + (a.y + a.h / 2 - L.headerHeight) * k;
        const bx = ox + b.x * k;
        const by = oy + (b.y + b.h / 2 - L.headerHeight) * k;
        const mx = ax + (bx - ax) / 2;
        pdf.line(ax, ay, mx, ay);
        pdf.line(mx, ay, mx, by);
        pdf.line(mx, by, bx, by);
      }
      for (const n of L.nodes) {
        const st = STATE_STYLE[n.step.state];
        pdf.setFillColor(...hex(st.fill));
        pdf.setDrawColor(...hex(st.stroke));
        pdf.setLineWidth(0.4);
        if (st.dash || n.step.optional) pdf.setLineDashPattern(st.dash ? [1.2, 0.8] : [0.6, 0.6], 0);
        pdf.roundedRect(ox + n.x * k, oy + (n.y - L.headerHeight) * k, n.w * k, n.h * k, 1.2, 1.2, "FD");
        pdf.setLineDashPattern([], 0);
        pdf.setTextColor(31, 31, 31);
        pdf.setFontSize(6.5);
        wrapText(`${n.step.index}. ${n.step.name}`, 20, 2).forEach((ln, li) =>
          pdf.text(ln, ox + (n.x + 6) * k, oy + (n.y + 13 + li * 11 - L.headerHeight) * k),
        );
        const meta = n.step.sscuiId ? `SSCUI ${n.step.sscuiId}` : n.step.app ? wrapText(n.step.app, 20, 1)[0]! : "";
        if (meta) {
          pdf.setTextColor(107, 107, 107);
          pdf.text(meta, ox + (n.x + 6) * k, oy + (n.y + n.h - 7 - L.headerHeight) * k);
        }
      }
    });
    // L3 table
    pdf.addPage();
    autoTable(pdf, {
      startY: 34,
      head: [["#", "Step", "Role", "App", "State", "SSCUI", "Marker", "Expected result", "Evidence"]],
      body: l3Rows(item).map((r) => [
        String(r.index),
        r.step,
        r.role,
        r.app,
        r.stateLabel,
        r.sscui,
        r.marker || "—",
        r.expected,
        r.evidence,
      ]),
      /*
       * Pin the text column rather than inherit a default margin: the widths
       * below are chosen against this figure, so they cannot silently
       * overflow. `top` matters as much: it is where autoTable resumes on a
       * continuation page, and it has to clear the header band that
       * `didDrawPage` paints there.
       */
      margin: { left: 12, right: 12, top: 34, bottom: 14 },
      /*
       * Repaint the header on every page the table spills onto. A long L3 ran
       * to three pages and only the first was titled — the reader was handed
       * loose grids of steps with nothing saying which scope item they belong
       * to. autoTable owns the page breaks, so the title has to be drawn from
       * its own hook rather than once before the call.
       */
      didDrawPage: (data) => {
        const first = data.pageNumber === 1;
        header(
          pdf,
          `${item.code} · ${item.title} — step detail (L3)${first ? "" : ", continued"}`,
          `evidence per step: scope ID · BPD ${doc.release} · SSCUI · BDC question`,
        );
      },
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: navy, textColor: 255 },
      /*
       * Keep a row whole. With the default split, a tall row (a long step name
       * wrapped over three lines) broke across the page boundary and the
       * continuation landed alone at the top of the next page as "(Optional)"
       * in one column and "(VF03)" in another — a fragment with no row to
       * belong to. Moving the whole row down costs a little whitespace and
       * makes every printed row readable as one thing.
       */
      rowPageBreak: "avoid",
      /*
       * Let autoTable size the columns. Fixed widths for all nine fought its
       * own sizing and it reported the table overflowing the page — shrinking
       * the declared widths made the reported overflow larger, not smaller.
       * The content needs only ~157mm of minimum width across nine columns
       * (measured from the longest unbreakable token in each at 7pt), so there
       * is ample slack in the 269mm text column; relative weights put it where
       * the prose is instead of spreading it evenly.
       */
      columnStyles: {
        0: { cellWidth: 8, halign: "right" },
        1: { cellWidth: "auto" },
        2: { cellWidth: "auto" },
        3: { cellWidth: "auto" },
        4: { cellWidth: 20 },
        5: { cellWidth: "auto" },
        6: { cellWidth: "auto" },
        7: { cellWidth: "auto" },
        8: { cellWidth: "auto" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          const row = l3Rows(item)[data.row.index];
          if (row) {
            data.cell.styles.fillColor = hex(STATE_STYLE[row.state].fill);
            data.cell.styles.textColor = hex(STATE_STYLE[row.state].stroke);
          }
        }
      },
    });
    if (item.configurations.length || item.gaps.length || (opts.consultantView && doc.consultantNotes?.[item.code])) {
      const afterY = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
      let ty = afterY + 8;
      pdf.setFontSize(8);
      pdf.setTextColor(31, 31, 31);
      /*
       * ADVANCE BY THE LINES ACTUALLY DRAWN. `pdf.text` with `maxWidth` wraps
       * internally and reports nothing back, so a fixed `ty += 5` moved one
       * line while the entry had drawn three — every wrapped configuration
       * landed on top of the next one. splitTextToSize does the same wrapping
       * up front, so the cursor and the ink agree, and a long list can start a
       * new page instead of running off the bottom.
       */
      const line = (text: string, muted = false): void => {
        const lines = pdf.splitTextToSize(text, pw - 28) as string[];
        if (ty + lines.length * 4 > ph - 16) {
          pdf.addPage();
          header(pdf, `${item.code} · ${item.title} — step detail (L3), continued`, "configurations and gaps");
          ty = 34;
        }
        pdf.setTextColor(...((muted ? [107, 107, 107] : [31, 31, 31]) as [number, number, number]));
        pdf.text(lines, 14, ty);
        ty += lines.length * 4 + 1.5;
      };
      for (const c of item.configurations)
        line(
          `Configured: SSCUI ${c.sscuiId}${c.sscuiName ? ` ${c.sscuiName}` : ""} · BDC ${c.questionId} (${c.choice})${c.scopeWide ? " · scope-wide" : ` · steps: ${c.stepNames.join(", ")}`}${c.reason ? ` · "${c.reason}"` : ""}`,
        );
      for (const g of item.gaps)
        line(
          `Gap (${g.gapType ?? "unclassified — confirm in workshop"}): BDC ${g.questionId}${g.reason ? ` · "${g.reason}"` : ""}`,
        );
      if (opts.consultantView && doc.consultantNotes?.[item.code])
        line(`Consultant note (internal): ${doc.consultantNotes[item.code]}`, true);
    }
  }

  // Footer on all pages
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setTextColor(107, 107, 107);
    pdf.text(
      `To-Be Process Pack · ${opts.clientName} · SAP content release ${doc.release} · ${doc.generatedAt} · page ${i} of ${pages}`,
      12,
      ph - 6,
    );
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}

/**
 * One narrative block per page: heading, lead paragraph, bullets or table, then
 * the footnote. Text wraps through splitTextToSize so the cursor always matches
 * the ink — the same failure the configuration list had.
 */
function narrativePage(
  pdf: jsPDF,
  block: NarrativeBlock,
  navy: [number, number, number],
  pw: number,
  ph: number,
): void {
  pdf.addPage();
  header(pdf, block.heading, block.sub ?? "");
  let y = 38;
  const write = (text: string, size: number, colour: [number, number, number], indent = 14): void => {
    pdf.setFontSize(size);
    pdf.setTextColor(...colour);
    const lines = pdf.splitTextToSize(text, pw - 28 - (indent - 14)) as string[];
    if (y + lines.length * (size * 0.42) > ph - 16) {
      pdf.addPage();
      header(pdf, `${block.heading} (continued)`, block.sub ?? "");
      y = 38;
    }
    pdf.text(lines, indent, y);
    y += lines.length * (size * 0.42) + 2;
  };

  if (block.lead) write(block.lead, 10, [31, 31, 31]);
  if (block.bullets) {
    y += 2;
    for (const b of block.bullets) {
      const top = y;
      write(b, 9, [31, 31, 31], 19);
      pdf.setFillColor(...navy);
      pdf.circle(15.5, top - 1.2, 0.8, "F");
      y += 1;
    }
  }
  if (block.table) {
    autoTable(pdf, {
      startY: y + 2,
      head: [block.table.head],
      body: block.table.rows,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: navy, textColor: 255 },
      rowPageBreak: "avoid",
    });
    y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
  }
  if (block.footnote) write(block.footnote, 8, [107, 107, 107]);
}

function header(pdf: jsPDF, title: string, sub: string): void {
  const pw = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(...hex(TOBE_NAVY));
  pdf.rect(0, 0, pw, 22, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(title, 12, 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(sub, 12, 17);
  pdf.setTextColor(31, 31, 31);
}
