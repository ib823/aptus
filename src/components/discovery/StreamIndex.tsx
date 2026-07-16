/**
 * ABeam Workbench — V2 stream index body (brief §7 V2).
 *
 * Client component only because of the search box (§7 V2). Everything it renders
 * is already-serialized view-model data.
 *
 * The .dc's search hides a whole workflow section when nothing matches and has
 * NO empty state — so an unmatched query leaves the reviewer staring at a fit bar
 * and nothing else, with no explanation. That reads as a broken page. Added an
 * honest empty state; logged as a new deviation (D11).
 */

"use client";

import { useMemo, useState } from "react";
import { SEARCH_PLACEHOLDER } from "@/lib/discovery/copy";
import type { DiscoveryWorkflowSection } from "@/lib/discovery/external/journey";
import { ProcessCard } from "./ProcessCard";

export interface StreamIndexProps {
  workflows: DiscoveryWorkflowSection[];
}

export function StreamIndex({ workflows }: StreamIndexProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workflows;
    return workflows
      .map((wf) => ({
        ...wf,
        processes: wf.processes.filter(
          (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
        ),
      }))
      .filter((wf) => wf.processes.length > 0);
  }, [workflows, query]);

  const shown = filtered.reduce((n, wf) => n + wf.processes.length, 0);

  return (
    <>
      <div className="ax-input mb-7">
        <label htmlFor="process-search" className="sr-only">
          Search processes in this value stream
        </label>
        <input
          id="process-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={SEARCH_PLACEHOLDER}
          className="h-10 w-full max-w-[360px] rounded-input border border-border-default bg-paper px-3.5 text-sm text-ink outline-none focus-visible:border-navy focus-visible:shadow-focus-ring"
        />
        {/* Result count announced politely — a filtered list that changes
            silently is invisible to a screen reader. */}
        <p aria-live="polite" className="sr-only">
          {query.trim() ? `${shown} processes match ${query}` : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-card-warm border border-border-default bg-paper px-8 py-8 text-center text-sm text-ink-muted">
          No processes match “{query}”. Try a shorter search, or clear it to see the whole stream.
        </p>
      ) : (
        filtered.map((wf) => (
          <section key={wf.name} className="mb-8">
            <div className="mb-3.5 flex items-baseline gap-2.5 border-b border-border-default pb-2">
              <h2 className="font-serif text-xl font-medium text-navy">{wf.name}</h2>
              <p className="text-[11px] text-ink-muted">
                {wf.processes.length} of {wf.processCount} processes shown
              </p>
            </div>
            <ul className="grid gap-3.5 md:grid-cols-2">
              {wf.processes.map((p) => (
                <ProcessCard key={p.id} process={p} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
