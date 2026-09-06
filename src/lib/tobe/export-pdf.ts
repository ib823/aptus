/**
 * 2608 WS6 — To-Be Process Pack as PDF (jsPDF + autoTable, the report engine's
 * own stack). Landscape A4: cover · summary · L1 chains · per scope item an L2
 * swimlane page (drawn from the shared `layoutL2` model) and an L3 table.
 * Colours are the renderer's tokens, so PDF, PPTX and screen agree.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { STATE_STYLE, TOBE_NAVY, l3Rows, layoutL2, paginateL2, wrapText } from "./svg";
import type { TobePackDoc, TobeStepState } from "./types";

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
    header(
      pdf,
      `${item.code} · ${item.title} — step detail (L3)`,
      `evidence per step: scope ID · BPD ${doc.release} · SSCUI · BDC question`,
    );
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
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: navy, textColor: 255 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 44 },
        2: { cellWidth: 30 },
        3: { cellWidth: 36 },
        4: { cellWidth: 22 },
        5: { cellWidth: 34 },
        6: { cellWidth: 28 },
        7: { cellWidth: 46 },
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
      let ty = Math.min(afterY + 8, ph - 30);
      pdf.setFontSize(8);
      pdf.setTextColor(31, 31, 31);
      for (const c of item.configurations) {
        pdf.text(
          `Configured: SSCUI ${c.sscuiId}${c.sscuiName ? ` ${c.sscuiName}` : ""} · BDC ${c.questionId} (${c.choice})${c.scopeWide ? " · scope-wide" : ` · steps: ${c.stepNames.join(", ")}`}${c.reason ? ` · "${c.reason}"` : ""}`,
          14,
          ty,
          { maxWidth: pw - 28 },
        );
        ty += 5;
      }
      for (const g of item.gaps) {
        pdf.text(
          `Gap (${g.gapType ?? "unclassified — confirm in workshop"}): BDC ${g.questionId}${g.reason ? ` · "${g.reason}"` : ""}`,
          14,
          ty,
          { maxWidth: pw - 28 },
        );
        ty += 5;
      }
      if (opts.consultantView && doc.consultantNotes?.[item.code]) {
        pdf.setTextColor(107, 107, 107);
        pdf.text(`Consultant note (internal): ${doc.consultantNotes[item.code]}`, 14, ty, { maxWidth: pw - 28 });
      }
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
