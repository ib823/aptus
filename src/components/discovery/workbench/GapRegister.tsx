/**
 * ABeam Workbench — C4 gap register (brief §6B.6).
 *
 * "The gap categories as work items: category · coverage · what's missing ·
 * assigned fill-source · owner · status (open / sourcing / drafting / filled) ·
 * target. This is the P3 backlog, designed as a tracker."
 *
 * The .dc drops owner and target and hardcodes every status to "Open"; brief
 * wins (conflict #15). Owner is the signed-in consultant on save — we do not ask
 * a consultant to type their own name into a field the session already knows.
 *
 * The ROWS are derived from live coverage (D14). The editable fields
 * (fill-source, status, note) persist to DiscoveryGap keyed by APQC code — so
 * when the next re-emission changes which categories are thin, the register
 * follows the data and any notes on a category that is no longer a gap simply
 * stop being shown, rather than the list silently lying.
 */

"use client";

import { useState } from "react";
import type { ApqcCategoryCoverage } from "@/lib/discovery/workbench/library";

const STATUSES = ["open", "sourcing", "drafting", "filled"] as const;
type GapStatus = (typeof STATUSES)[number];

const STATUS_LABEL: Record<GapStatus, string> = {
  open: "Open",
  sourcing: "Sourcing",
  drafting: "Drafting",
  filled: "Filled",
};

export interface StoredGap {
  id: string;
  apqcCode: string;
  fillSource: string | null;
  status: string;
  note: string | null;
}

export interface GapRegisterProps {
  gaps: ApqcCategoryCoverage[];
  stored: StoredGap[];
}

export function GapRegister({ gaps, stored }: GapRegisterProps) {
  const byCode = new Map(stored.map((s) => [s.apqcCode, s]));
  const [saving, setSaving] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function save(apqcCode: string, title: string, patch: Record<string, string>) {
    setSaving(apqcCode);
    try {
      const res = await fetch("/api/discovery/gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apqcCode, title, ...patch }),
      });
      setNote(res.ok ? `Saved ${apqcCode}` : "Could not save that.");
    } catch {
      setNote("Could not save that.");
    } finally {
      setSaving(null);
    }
  }

  if (gaps.length === 0) {
    // Brief §7-C4's "all-strong celebratory" state — kept honest, not confetti.
    return (
      <p className="rounded-input border border-decision-standard/30 bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] px-4 py-8 text-center text-[13px] font-semibold text-decision-standard">
        Every APQC category carries flows for most of its processes. Nothing to work.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-auto rounded-input border border-border-default bg-paper">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <caption className="sr-only">
            Gap register — APQC categories below 50% flow coverage, worst first, with the fill
            source and status for each.
          </caption>
          <thead className="bg-ink-tint">
            <tr>
              {["Code", "Category", "Coverage", "What's missing", "Fill source", "Status"].map((h) => (
                <th key={h} scope="col" className="border-b border-border-default px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-soft">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gaps.map((g) => {
              const s = byCode.get(g.code);
              const missing = g.total - g.withFlow;
              return (
                <tr key={g.code} className="border-b border-ink-tint">
                  <th scope="row" className="px-3.5 py-3 font-mono text-[11px] font-bold text-navy">{g.code}</th>
                  <td className="px-3.5 py-3 text-xs text-ink">{g.category}</td>
                  <td className="px-3.5 py-3 font-mono text-xs text-ink-soft">
                    {g.withFlow}/{g.total} ({Math.round(g.flowShare * 100)}%)
                  </td>
                  {/* "What's missing" is computed, not typed: the honest answer
                      is exactly how many processes lack a flow. */}
                  <td className="px-3.5 py-3 text-[11px] text-ink-soft">
                    {missing} {missing === 1 ? "process has" : "processes have"} no step flow catalogued
                  </td>
                  <td className="px-3.5 py-3">
                    <label className="sr-only" htmlFor={`fill-${g.code}`}>Fill source for {g.category}</label>
                    <input
                      id={`fill-${g.code}`}
                      defaultValue={s?.fillSource ?? ""}
                      placeholder="Not assigned"
                      disabled={saving === g.code}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (s?.fillSource ?? "")) {
                          void save(g.code, g.category, { fillSource: e.target.value });
                        }
                      }}
                      className="h-[26px] w-full rounded-input border border-navy-border bg-navy-soft px-2 text-[11px] text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
                    />
                  </td>
                  <td className="px-3.5 py-3">
                    <label className="sr-only" htmlFor={`status-${g.code}`}>Status for {g.category}</label>
                    <select
                      id={`status-${g.code}`}
                      defaultValue={(s?.status as GapStatus) ?? "open"}
                      disabled={saving === g.code}
                      onChange={(e) => void save(g.code, g.category, { status: e.target.value })}
                      className="h-[26px] rounded-input border border-navy-border bg-navy-soft px-1.5 text-[11px] text-ink focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>{STATUS_LABEL[st]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p aria-live="polite" className="mt-2 min-h-[16px] text-[11px] text-ink-soft">{note}</p>
    </>
  );
}
