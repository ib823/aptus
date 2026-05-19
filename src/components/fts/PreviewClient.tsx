"use client";

import type { ScopeItemContent } from "@/lib/fts/types";

interface Props {
  scope: ScopeItemContent;
}

/**
 * Phase 1 stakeholder preview — one printable page that process owners,
 * power users, and IT leads receive one week before their Cloud ALM workshop.
 *
 * Goal: educate, not decide. No choice buttons, no signoff. Just "here's
 * what this is, what you'll do, and what to try in your sandbox before the
 * workshop."
 */
export function PreviewClient({ scope }: Props) {
  const primaryRole = scope.business_roles[0]?.name ?? "TBD";
  const primaryApp = scope.fiori_apps[0] ?? "TBD";

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        {/* Header */}
        <div className="mb-6 pb-6 border-b border-slate-200">
          <div className="text-xs font-mono text-slate-500 uppercase tracking-wide">
            Process preview · Phase 1 stakeholder kit
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {scope.title}
          </h1>
          <div className="text-sm text-slate-600 mt-1">
            Scope item{" "}
            <span className="font-mono font-semibold">{scope.code}</span> ·{" "}
            {scope.release}
          </div>
        </div>

        {/* What it is */}
        <section className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-2">
            What this is
          </h2>
          <p className="text-slate-800 leading-relaxed">{scope.overview}</p>
        </section>

        {/* Role + App */}
        <section className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <RoleCard
            label="Your role"
            value={primaryRole}
            hint="This is the person whose day-to-day this process is part of."
          />
          <RoleCard
            label="Where you'll work"
            value={primaryApp}
            hint="The main SAP Fiori app you'll spend time in."
          />
        </section>

        {/* Steps */}
        <section className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-4">
            What you&rsquo;ll do, step by step
          </h2>
          <div className="space-y-3">
            {scope.process_steps.map((step, i) => (
              <div key={`${step.name}-${i}`} className="flex gap-4 items-start">
                <div className="flex-none w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">
                  {i + 1}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    {step.name}
                  </div>
                  <div className="text-sm text-slate-600 mt-0.5">
                    {step.expected}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 font-mono">
                    App: {step.app}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sandbox prep */}
        <section className="mb-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-700 mb-2">
            Before your workshop: try it yourself
          </h2>
          <p className="text-sm text-emerald-900 mb-3">
            A sandbox tenant will be made available for you. Spend 30 minutes
            clicking through these steps in the real system before the workshop.
            Familiarity beats explanation.
          </p>
          <ol className="text-sm text-emerald-900 list-decimal pl-5 space-y-1">
            {scope.process_steps.slice(0, 5).map((step, i) => (
              <li key={i}>
                <strong>{step.name}</strong> — open {step.app}
              </li>
            ))}
          </ol>
        </section>

        {/* Walking in expectations */}
        <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-800 mb-2">
            When you walk into the workshop
          </h2>
          <p className="text-sm text-amber-900">
            The session will be a confirmation, not a discovery. Senior
            leadership has already agreed on the major decisions for this
            process. Your job is to validate that the standard SAP flow works
            for your day-to-day, and to flag anything that genuinely won&rsquo;t. If
            something feels off, raise it — the change request process is open
            from Day 1.
          </p>
        </section>

        <div className="text-xs text-slate-400 mt-8 pt-4 border-t border-slate-200">
          Aptus · Phase 1 Stakeholder Kit
        </div>
      </div>

      <div className="no-print text-center mt-6 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700"
        >
          Print / save as PDF
        </button>
      </div>
    </main>
  );
}

function RoleCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </div>
      <div className="font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{hint}</div>
    </div>
  );
}
