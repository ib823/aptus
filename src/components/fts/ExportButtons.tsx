"use client";

import { useState } from "react";
import type { DecisionState, ScopeItemContent } from "@/lib/fts/types";
import {
  buildBaselineJson,
  downloadBlob,
  exportTeamBacklog,
} from "@/lib/fts/excel-export";

interface Props {
  scope: ScopeItemContent;
  choices: Record<string, DecisionState>;
  clientName: string;
}

/**
 * Action row at the bottom of the workbench. Three options:
 *   1. Export team backlog (Excel) — the Explore-phase handoff
 *   2. Export baseline (JSON) — machine-readable audit trail
 *   3. Print / save as PDF — client-facing baseline document
 */
export function ExportButtons({ scope, choices, clientName }: Props) {
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const handleExcel = async () => {
    setBusy(true);
    setLastExport(null);
    try {
      const filename = await exportTeamBacklog({ scope, choices, clientName });
      setLastExport(filename);
    } catch (err) {
      console.error("Excel export failed:", err);
      setLastExport(
        "Export failed — check console. SheetJS may not be installed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleJson = () => {
    const json = buildBaselineJson({ scope, choices, clientName });
    downloadBlob(
      json,
      `${scope.code}_fit-to-standard_baseline.json`,
      "application/json",
    );
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div className="mt-5 flex gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleExcel}
          disabled={busy}
          className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? "Building Excel…" : "Export team backlog (Excel)"}
        </button>
        <button
          type="button"
          onClick={handleJson}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700"
        >
          Export baseline (JSON)
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-100"
        >
          Print / save as PDF
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-3">
        The Excel export is the handoff to your delivery team — three tabs
        (Summary, Configure Backlog, Custom RICEFW Backlog), pre-populated from
        the decisions above. Drop it into your project tracker on Day 1 of the
        Explore phase.
      </p>
      {lastExport && (
        <p className="text-xs text-emerald-700 mt-2 font-mono">
          ✓ {lastExport}
        </p>
      )}
    </>
  );
}
