/**
 * ABeam Workbench — C2 library grid.
 *
 * Brief §11: "data grids are REAL TABLES with headers". The .dc builds it from
 * CSS-grid `div`s with no roles at all (conflict #25), which means a screen
 * reader hears 742 × 11 unlabelled cells in a flat run — no row/column context,
 * no "column 4 of 11", no way to know which value is which. So: a real
 * `<table>`, `<caption>`, `<th scope>`, and one tab stop.
 *
 * KEYBOARD (§11: arrows / space / ⏎). This is the WAI-ARIA grid pattern:
 *  - The table is ONE tab stop; arrows move a roving cell cursor.
 *  - ↑/↓ move rows, ←/→ move columns, Home/End jump within a row,
 *    Ctrl+Home/End jump to the corners, PageUp/PageDown move by 10.
 *  - ⏎ or Space opens the focused row's process (C3).
 * Without this, reaching row 700 costs 7,700 Tab presses.
 *
 * Sorting is announced via aria-sort so the change is not silent.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LibraryRow, LibrarySortKey } from "@/lib/discovery/workbench/library";

interface Column {
  key: LibrarySortKey | null;
  label: string;
  /** Narrow columns get a fixed width; the process name flexes. */
  className?: string;
}

const COLUMNS: Column[] = [
  { key: "id", label: "ID", className: "w-[62px]" },
  { key: "name", label: "Process" },
  { key: "stream", label: "Stream", className: "w-[130px]" },
  { key: "workflow", label: "Workflow", className: "w-[160px]" },
  { key: "apqc", label: "APQC", className: "w-[52px]" },
  { key: null, label: "Tier", className: "w-[84px]" },
  { key: null, label: "Industry", className: "w-[96px]" },
  { key: "origin", label: "Origin", className: "w-[92px]" },
  { key: "completeness", label: "Completeness", className: "w-[122px]" },
  { key: "steps", label: "Steps", className: "w-[62px]" },
  { key: null, label: "Flow", className: "w-[44px]" },
];

const COMPLETENESS_PILL: Record<string, string> = {
  "detailed+variants":
    "bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] text-decision-standard",
  detailed: "bg-navy-soft text-navy",
  outline: "bg-ink-tint text-ink-muted",
  none: "bg-ink-tint text-ink-muted",
};

export interface LibraryTableProps {
  rows: LibraryRow[];
  total: number;
  matched: number;
  sort: LibrarySortKey;
  dir: "asc" | "desc";
  onSort: (key: LibrarySortKey) => void;
}

export function LibraryTable({ rows, total, matched, sort, dir, onSort }: LibraryTableProps) {
  const router = useRouter();
  const [cursor, setCursor] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  const key = (r: number, c: number) => `${r}:${c}`;

  const focusCell = useCallback((r: number, c: number) => {
    const el = cellRefs.current.get(key(r, c));
    el?.focus();
  }, []);

  useEffect(() => {
    // A filter change can shrink the table under the cursor.
    setCursor((cur) => ({ r: Math.min(cur.r, Math.max(rows.length - 1, 0)), c: cur.c }));
  }, [rows.length]);

  const open = useCallback(
    (row: LibraryRow | undefined) => {
      if (row) router.push(`/discovery/library/${encodeURIComponent(row.scope_id)}`);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent, r: number, c: number) {
    const lastRow = rows.length - 1;
    const lastCol = COLUMNS.length - 1;
    let next: { r: number; c: number } | null = null;

    switch (e.key) {
      case "ArrowDown":
        next = { r: Math.min(r + 1, lastRow), c };
        break;
      case "ArrowUp":
        next = { r: Math.max(r - 1, 0), c };
        break;
      case "ArrowRight":
        next = { r, c: Math.min(c + 1, lastCol) };
        break;
      case "ArrowLeft":
        next = { r, c: Math.max(c - 1, 0) };
        break;
      case "Home":
        next = e.ctrlKey ? { r: 0, c: 0 } : { r, c: 0 };
        break;
      case "End":
        next = e.ctrlKey ? { r: lastRow, c: lastCol } : { r, c: lastCol };
        break;
      case "PageDown":
        next = { r: Math.min(r + 10, lastRow), c };
        break;
      case "PageUp":
        next = { r: Math.max(r - 10, 0), c };
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        open(rows[r]);
        return;
      default:
        return;
    }
    e.preventDefault();
    setCursor(next);
    focusCell(next.r, next.c);
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-input border border-border-default bg-paper">
      <table className="w-full min-w-[1080px] border-collapse text-left">
        <caption className="sr-only">
          Process library — {matched} of {total} processes match the current filters. Use the arrow
          keys to move between cells, Enter to open a process.
        </caption>
        <thead className="sticky top-0 z-[2] bg-ink-tint">
          <tr>
            {COLUMNS.map((col) => {
              const isSorted = col.key !== null && col.key === sort;
              return (
                <th
                  key={col.label}
                  scope="col"
                  aria-sort={isSorted ? (dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`border-b border-border-default px-1.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted ${col.className ?? ""}`}
                >
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key!)}
                      className="flex items-center gap-1 uppercase focus-visible:shadow-focus-ring focus-visible:outline-none"
                    >
                      {col.label}
                      {isSorted && (
                        <span aria-hidden="true" className="text-navy">
                          {dir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, r) => (
            <tr
              key={row.scope_id}
              className="border-b border-ink-tint even:bg-ink-tint/40 hover:bg-navy-soft"
            >
              {COLUMNS.map((col, c) => {
                const focusable = cursor.r === r && cursor.c === c;
                const common = {
                  ref: (el: HTMLTableCellElement | null) => {
                    if (el) cellRefs.current.set(key(r, c), el);
                    else cellRefs.current.delete(key(r, c));
                  },
                  tabIndex: focusable ? 0 : -1,
                  onKeyDown: (e: React.KeyboardEvent) => onKeyDown(e, r, c),
                  onFocus: () => setCursor({ r, c }),
                  onClick: () => open(row),
                  className:
                    "cursor-pointer px-1.5 py-2 align-middle text-xs text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none",
                };
                if (col.label === "ID") {
                  return (
                    <th key={col.label} scope="row" {...common} className={`${common.className} font-mono text-[11px] font-bold text-navy`}>
                      {row.scope_id}
                    </th>
                  );
                }
                return (
                  <td key={col.label} {...common}>
                    {cellContent(col.label, row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="px-6 py-16 text-center text-[13px] text-ink-muted">
          No processes match these filters.
        </p>
      )}
    </div>
  );
}

function cellContent(label: string, row: LibraryRow) {
  switch (label) {
    case "Process":
      return <span className="font-semibold text-ink">{row.name}</span>;
    case "Stream":
      return row.streamName;
    case "Workflow":
      return row.workflowName;
    case "APQC":
      return <span className="font-mono text-[11px] text-ink-muted">{row.apqcCode ?? "—"}</span>;
    case "Tier":
      return (
        <span
          className={`inline-flex h-[18px] items-center rounded-input px-1.5 text-[10px] font-bold ${
            row.tier === "core" ? "bg-navy-soft text-navy" : "bg-ink-tint text-ink-muted"
          }`}
        >
          {row.tier === "core" ? "Core" : "Generalized"}
        </span>
      );
    case "Industry":
      return <span className="text-[11px] text-ink-muted">{row.industry ?? "—"}</span>;
    case "Origin":
      // Origin is consultant-only vocabulary; it never crosses to /d.
      return (
        <span className="font-mono text-[10px] uppercase text-ink-muted">
          {row.origin === "sap-base" ? "Base" : "Overlay"}
        </span>
      );
    case "Completeness":
      return (
        <span
          className={`inline-flex h-[18px] items-center rounded-pill px-2 text-[9px] font-bold uppercase ${COMPLETENESS_PILL[row.completeness ?? "none"]}`}
        >
          {row.completeness ?? "No flow"}
        </span>
      );
    case "Steps":
      return (
        <span className="font-mono text-[11px]">
          {row.hasFlow ? `${row.mainSteps}${row.subSteps > 0 ? `+${row.subSteps}` : ""}` : "—"}
        </span>
      );
    case "Flow":
      // Glyph + a text label for a screen reader — never a bare mark.
      return row.hasFlow ? (
        <span className="text-decision-standard">
          <span aria-hidden="true">✓</span>
          <span className="sr-only">Has a step flow</span>
        </span>
      ) : (
        <span className="text-ink-disabled">
          <span aria-hidden="true">–</span>
          <span className="sr-only">No step flow catalogued</span>
        </span>
      );
    default:
      return null;
  }
}
