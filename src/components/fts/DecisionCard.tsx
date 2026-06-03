"use client";

import { useState } from "react";
import type {
  Decision,
  DecisionChoice,
  DecisionState,
} from "@/lib/fts/types";
import { OptionCard } from "./OptionCard";

interface Props {
  index: number;
  decision: Decision;
  state: DecisionState | undefined;
  onChange: (id: string, next: Partial<DecisionState>) => void;
}

/**
 * One expandable decision card with three radio-style choice buttons,
 * a free-text notes field, and a status pill that mirrors the choice.
 *
 * The card is opened by default for the first decision; others collapse
 * to keep the workbench scannable.
 */
export function DecisionCard({ index, decision, state, onChange }: Props) {
  const [open, setOpen] = useState(index === 0);
  const choice: DecisionChoice = state?.choice ?? "open";

  const handleChoice = (next: DecisionChoice, effort: number) => {
    onChange(decision.id, { choice: next, effort });
  };

  const handleNotes = (notes: string) => {
    onChange(decision.id, { notes });
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
      >
        <div className="flex items-center gap-3 flex-1">
          <span
            className={`text-slate-400 transition-transform inline-block ${
              open ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
          <div>
            <div className="font-semibold text-slate-900">
              {index + 1}. {decision.title}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {decision.sscui}
            </div>
          </div>
        </div>
        <StatusPill choice={choice} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-slate-50/50">
          <p className="text-sm text-slate-700 mb-4">{decision.summary}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <OptionCard
              kind="std"
              label="Standard"
              description={decision.std_desc}
              effortLabel="+0 days"
              selected={choice === "std"}
              onSelect={() => handleChoice("std", 0)}
            />
            <OptionCard
              kind="cfg"
              label="Configure (SSCUI)"
              description={decision.cfg_desc}
              effortLabel="+0 days (included)"
              selected={choice === "cfg"}
              onSelect={() => handleChoice("cfg", 0)}
            />
            <OptionCard
              kind="cst"
              label="Custom (chargeable)"
              description={decision.cst_desc}
              effortLabel={`+${decision.effort} days`}
              selected={choice === "cst"}
              onSelect={() => handleChoice("cst", decision.effort)}
            />
          </div>
          <div className="mt-3">
            <label className="text-xs text-slate-500">
              Notes / client comments
            </label>
            <textarea
              className="w-full mt-1 p-2 text-sm border border-slate-200 rounded bg-white"
              rows={2}
              value={state?.notes ?? ""}
              onChange={(e) => handleNotes(e.target.value)}
              placeholder="e.g., 'We use 4 inquiry types in legacy — review in workshop W2'"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ choice }: { choice: DecisionChoice }) {
  const cls =
    choice === "std"
      ? "bg-emerald-100 text-emerald-700"
      : choice === "cfg"
        ? "bg-blue-100 text-blue-700"
        : choice === "cst"
          ? "bg-red-100 text-red-700"
          : "bg-slate-100 text-slate-700";
  const label =
    choice === "std"
      ? "Standard"
      : choice === "cfg"
        ? "Configure"
        : choice === "cst"
          ? "Custom"
          : "Open";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}
