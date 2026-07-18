/**
 * ABeam Workbench — C2 library manager: facets + search + the grid.
 *
 * All seven facets the brief asks for (§6B.1): stream / workflow / APQC /
 * completeness / tier / industry / has-flow. The .dc omits APQC and industry
 * (conflict #4) — brief wins. Workflow cascades off the selected stream, which
 * the .dc does and is right: 85 workflows in one flat select is unusable.
 *
 * Filtering is client-side over the 742 committed rows. That is deliberate — the
 * library is a frozen JSON file, not a query surface, so a round-trip per
 * keystroke would buy nothing.
 */

"use client";

import { useMemo, useState } from "react";
import type { LibraryFacets, LibraryRow, LibrarySortKey } from "@/lib/discovery/workbench/library";
import { LibraryTable } from "./LibraryTable";

export interface LibraryManagerProps {
  rows: LibraryRow[];
  facets: LibraryFacets;
}

const SELECT_CLASS =
  "h-[34px] rounded-input border border-border-default bg-paper px-2 text-xs text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none";

export function LibraryManager({ rows, facets }: LibraryManagerProps) {
  const [q, setQ] = useState("");
  const [stream, setStream] = useState("");
  const [workflow, setWorkflow] = useState("");
  const [apqc, setApqc] = useState("");
  const [completeness, setCompleteness] = useState("");
  const [tier, setTier] = useState("");
  const [industry, setIndustry] = useState("");
  const [hasFlow, setHasFlow] = useState("");
  const [sort, setSort] = useState<LibrarySortKey>("id");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // Workflow options cascade off the chosen stream.
  const workflowOptions = useMemo(() => {
    const pool = stream ? rows.filter((r) => r.streamId === stream) : rows;
    return [...new Set(pool.map((r) => r.workflowName))].sort();
  }, [rows, stream]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (stream && r.streamId !== stream) return false;
      if (workflow && r.workflowName !== workflow) return false;
      if (apqc && r.apqcCode !== apqc) return false;
      if (completeness && (r.completeness ?? "none") !== completeness) return false;
      if (tier && r.tier !== tier) return false;
      if (industry && r.industry !== industry) return false;
      if (hasFlow === "yes" && !r.hasFlow) return false;
      if (hasFlow === "no" && r.hasFlow) return false;
      if (
        needle &&
        !r.name.toLowerCase().includes(needle) &&
        !r.scope_id.toLowerCase().includes(needle) &&
        !r.description.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });

    const mul = dir === "desc" ? -1 : 1;
    const rank: Record<string, number> = { none: 0, outline: 1, detailed: 2, "detailed+variants": 3 };
    return [...out].sort((a, b) => {
      let d = 0;
      switch (sort) {
        case "name": d = a.name.localeCompare(b.name); break;
        case "stream": d = a.streamName.localeCompare(b.streamName) || a.workflowName.localeCompare(b.workflowName); break;
        case "workflow": d = a.workflowName.localeCompare(b.workflowName); break;
        case "apqc": d = Number(a.apqcCode ?? 99) - Number(b.apqcCode ?? 99); break;
        case "completeness": d = (rank[a.completeness ?? "none"] ?? 0) - (rank[b.completeness ?? "none"] ?? 0); break;
        case "steps": d = a.mainSteps + a.subSteps - (b.mainSteps + b.subSteps); break;
        case "origin": d = a.origin.localeCompare(b.origin); break;
        default: d = a.scope_id.localeCompare(b.scope_id);
      }
      return d * mul || a.scope_id.localeCompare(b.scope_id);
    });
  }, [rows, q, stream, workflow, apqc, completeness, tier, industry, hasFlow, sort, dir]);

  function onSort(key: LibrarySortKey) {
    if (key === sort) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDir("asc");
    }
  }

  function clear() {
    setQ(""); setStream(""); setWorkflow(""); setApqc("");
    setCompleteness(""); setTier(""); setIndustry(""); setHasFlow("");
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="lib-search" className="sr-only">Filter by name, ID or description</label>
        <input
          id="lib-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name or ID…"
          className={`${SELECT_CLASS} w-[220px]`}
        />

        <label htmlFor="f-stream" className="sr-only">Value stream</label>
        <select id="f-stream" value={stream} onChange={(e) => { setStream(e.target.value); setWorkflow(""); }} className={SELECT_CLASS}>
          <option value="">Stream: all</option>
          {facets.streams.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
        </select>

        <label htmlFor="f-workflow" className="sr-only">Workflow</label>
        <select id="f-workflow" value={workflow} onChange={(e) => setWorkflow(e.target.value)} className={SELECT_CLASS}>
          <option value="">Workflow: all</option>
          {workflowOptions.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>

        <label htmlFor="f-apqc" className="sr-only">APQC category</label>
        <select id="f-apqc" value={apqc} onChange={(e) => setApqc(e.target.value)} className={SELECT_CLASS}>
          <option value="">APQC: all</option>
          {facets.apqc.map((a) => <option key={a.code} value={a.code}>{a.code} {a.category} ({a.count})</option>)}
        </select>

        <label htmlFor="f-completeness" className="sr-only">Completeness</label>
        <select id="f-completeness" value={completeness} onChange={(e) => setCompleteness(e.target.value)} className={SELECT_CLASS}>
          <option value="">Completeness: all</option>
          <option value="detailed+variants">Detailed + variants</option>
          <option value="detailed">Detailed</option>
          <option value="outline">Outline</option>
          <option value="none">No flow</option>
        </select>

        <label htmlFor="f-tier" className="sr-only">Tier</label>
        <select id="f-tier" value={tier} onChange={(e) => setTier(e.target.value)} className={SELECT_CLASS}>
          <option value="">Tier: all</option>
          <option value="core">Core</option>
          <option value="generalized">Generalized</option>
        </select>

        <label htmlFor="f-industry" className="sr-only">Industry</label>
        <select id="f-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} className={SELECT_CLASS}>
          <option value="">Industry: all</option>
          {facets.industries.map((i) => <option key={i.value} value={i.value}>{i.value} ({i.count})</option>)}
        </select>

        <label htmlFor="f-flow" className="sr-only">Has a step flow</label>
        <select id="f-flow" value={hasFlow} onChange={(e) => setHasFlow(e.target.value)} className={SELECT_CLASS}>
          <option value="">Flow: all</option>
          <option value="yes">Has flow ({facets.hasFlow.yes})</option>
          <option value="no">No flow ({facets.hasFlow.no})</option>
        </select>

        <button
          type="button"
          onClick={clear}
          className="h-[34px] rounded-input border border-border-default bg-ink-tint px-3 text-xs font-semibold text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          Clear
        </button>
      </div>

      <p aria-live="polite" className="mb-2.5 text-xs text-ink-soft">
        Showing {filtered.length} of {rows.length} processes
        {filtered.length !== rows.length ? " matching these filters" : ""}.
      </p>

      <LibraryTable
        rows={filtered}
        total={rows.length}
        matched={filtered.length}
        sort={sort}
        dir={dir}
        onSort={onSort}
      />
    </>
  );
}
