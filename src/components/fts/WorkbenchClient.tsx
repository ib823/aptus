"use client";

import { useEffect, useMemo, useState } from "react";
import type { DecisionState, ScopeItemContent } from "@/lib/fts/types";
import { DecisionCard } from "./DecisionCard";
import { ExportButtons } from "./ExportButtons";
import { SignoffBlock } from "./SignoffBlock";
import { StickyScorecard } from "./StickyScorecard";

interface Props {
  scope: ScopeItemContent;
  /** Optional initial client name (e.g. from engagement context). */
  initialClientName?: string;
  /** Optional initial preparer name (e.g. from session user). */
  initialPreparerName?: string;
}

/**
 * The interactive shell of the workbench page. Owns the choices state and
 * threads it through the children.
 */
export function WorkbenchClient({
  scope,
  initialClientName = "",
  initialPreparerName = "",
}: Props) {
  const [choices, setChoices] = useState<Record<string, DecisionState>>({});
  const [clientName, setClientName] = useState(initialClientName);
  const [preparerName, setPreparerName] = useState(initialPreparerName);
  const [reviewDate, setReviewDate] = useState("");

  useEffect(() => {
    setReviewDate(
      new Date().toLocaleDateString("en-MY", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    );
  }, []);

  const updateChoice = (id: string, next: Partial<DecisionState>) => {
    setChoices((prev) => {
      const existing = prev[id] ?? { choice: "open", effort: 0, notes: "" };
      return { ...prev, [id]: { ...existing, ...next } };
    });
  };

  const primaryRole = scope.business_roles[0]?.name ?? "TBD";
  const primaryApp = scope.fiori_apps[0] ?? "TBD";
  const succeeding = useMemo(
    () =>
      scope.succeeding_processes
        .slice(0, 3)
        .map((sp) => sp.raw.split(/[–-]/)[0]?.trim() ?? sp.raw)
        .join(", ") || "End of flow",
    [scope.succeeding_processes],
  );

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge label="FIT-TO-STANDARD WORKBENCH" />
                <Badge label={scope.release} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                {scope.title}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Pre-onboarding process walkthrough &amp; signoff · Scope item{" "}
                <span className="font-mono font-semibold">{scope.code}</span>
              </p>
            </div>
            <div className="text-xs text-slate-500 md:text-right space-y-1">
              <LabeledInline
                label="Client"
                value={clientName}
                placeholder="[click to set]"
                onChange={setClientName}
              />
              <div>
                Date:{" "}
                <span className="font-semibold text-slate-700">
                  {reviewDate}
                </span>
              </div>
              <LabeledInline
                label="Prepared by"
                value={preparerName}
                placeholder="[your name]"
                onChange={setPreparerName}
              />
            </div>
          </div>
        </div>
      </header>

      <StickyScorecard
        totalDecisions={scope.decisions.length}
        choices={choices}
      />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* What this process does */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            What this process does for your business
          </h2>
          <p className="text-slate-700 leading-relaxed">{scope.overview}</p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <SummaryCard label="Who uses it" value={primaryRole} />
            <SummaryCard label="Where in SAP" value={primaryApp} />
            <SummaryCard label="What comes after" value={succeeding} />
          </div>
        </section>

        {/* Typical day */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            A typical day in this process
          </h2>
          <p className="text-sm text-slate-500 mb-5">
            The steps your team will actually do.
          </p>
          <div className="space-y-4">
            {scope.process_steps.map((step, i) => (
              <div
                key={`${step.name}-${i}`}
                className="border-l-4 border-emerald-400 pl-4"
              >
                <div className="font-semibold text-slate-900">
                  {i + 1}. {step.name}
                </div>
                <div className="text-slate-700 text-sm mt-1">
                  In the <em>{step.app}</em> app, the <em>{step.role}</em>{" "}
                  performs this step. Expected outcome: {step.expected}.
                </div>
              </div>
            ))}
            {scope.process_steps.length === 0 && (
              <div className="text-slate-500 text-sm">
                No process steps extracted from BPD.
              </div>
            )}
          </div>
        </section>

        {/* Decisions */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-lg font-bold text-slate-900">
              Decisions you need to make
            </h2>
            <div className="text-xs text-slate-500">
              {scope.decisions.length} decisions
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-5">
            For each item below, choose how you want it handled. Your selection
            becomes part of the signed Fit-to-Standard baseline and the team&rsquo;s
            Explore-phase backlog.
          </p>
          <div className="space-y-3">
            {scope.decisions.map((d, i) => (
              <DecisionCard
                key={d.id}
                index={i}
                decision={d}
                state={choices[d.id]}
                onChange={updateChoice}
              />
            ))}
          </div>
        </section>

        {/* Custom warning */}
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-amber-900 mb-2">
            Read this before you pick &ldquo;Custom&rdquo;
          </h2>
          <ul className="space-y-2 text-sm text-amber-900 list-disc pl-5">
            <li>
              <strong>Standard (free):</strong> SAP delivers it. Zero
              implementation cost beyond activation.
            </li>
            <li>
              <strong>Configure via SSCUI (included):</strong> SAP allows it via
              Self-Service Configuration. Settings change in a controlled UI.
              Included in base implementation. No code, no upgrade risk.
            </li>
            <li>
              <strong>Custom (chargeable):</strong> Built using Key User or
              Developer Extensibility. Added effort, ongoing regression testing
              on every release (twice a year), may delay go-live.
            </li>
          </ul>
        </section>

        {/* Sign-off + outputs */}
        <SignoffBlock scopeCode={scope.code} scopeTitle={scope.title} />
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-bold text-slate-900 mb-1">Outputs</h3>
          <ExportButtons
            scope={scope}
            choices={choices}
            clientName={clientName}
          />
        </section>

        {/* Audit appendix */}
        <section className="text-xs text-slate-500 pt-4 border-t border-slate-200">
          <details>
            <summary className="font-semibold text-slate-600 mb-2 cursor-pointer">
              Source mapping (auditor / consultant view)
            </summary>
            <div className="mt-3 space-y-2 font-mono">
              <div>
                Scope item: {scope.code} · {scope.release}
              </div>
              {scope.master_data.length > 0 && (
                <>
                  <div className="pt-2 border-t border-slate-200">
                    Master data dependencies:
                  </div>
                  <div className="pl-2 space-y-0.5">
                    {scope.master_data.slice(0, 8).map((md, i) => (
                      <div key={i}>
                        • <span className="font-semibold">{md.data}</span>:{" "}
                        {md.sample} — {md.details}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {scope.sscui_refs.length > 0 ? (
                <>
                  <div className="pt-2 border-t border-slate-200">
                    SSCUI catalog references ({scope.sscui_refs.length} mapped):
                  </div>
                  <div className="pl-2 space-y-0.5">
                    {scope.sscui_refs.slice(0, 30).map((s, i) => (
                      <div key={i}>
                        •{" "}
                        <span className="font-semibold">{s.sscui_id}</span> —{" "}
                        {s.name}{" "}
                        <span className="text-slate-400">({s.category})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="pt-2 border-t border-slate-200">
                  No SSCUI entries map directly to this scope item — check
                  related items.
                </div>
              )}
            </div>
          </details>
        </section>
      </main>

      <footer className="text-center text-xs text-slate-400 py-6">
        Aptus · Fit-to-Standard Workbench · Generated from SAP Best Practices
      </footer>
    </>
  );
}

// ---------- helpers ----------

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold tracking-wide">
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </div>
      <div className="font-semibold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function LabeledInline({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      {label}:{" "}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-semibold text-slate-900 bg-transparent border-b border-dotted border-slate-300 focus:outline-none focus:border-slate-500 w-40 md:w-48"
      />
    </div>
  );
}
