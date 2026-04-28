/**
 * Phase 8 — AD-9: portfolio insights surface.
 *
 * Top-level home for cross-assessment surfaces (activity / benchmarks /
 * triggers / phase-bridge / patterns). Replaces the misplaced routes
 * under /assessment/[id]/* that were assessment-scoped but reached
 * across assessments anyway.
 */

import Link from "next/link";

const SECTIONS = [
  { key: "activity",      label: "Activity",       description: "Cross-assessment activity feed (filterable per assessment)." },
  { key: "benchmarks",    label: "Benchmarks",     description: "Industry benchmarking dashboard with cohort selection." },
  { key: "triggers",      label: "Triggers",       description: "Lifecycle triggers across all assessments — SAP updates, regulatory changes, scope drift." },
  { key: "phase-bridge",  label: "Phase Bridge",   description: "Track phase transitions across assessments (replaces the misplaced /assessment/[id]/cross-phase)." },
  { key: "patterns",      label: "Patterns",       description: "Cross-assessment pattern library — \"in your industry, scope item X is C 80% of the time\"." },
];

export default function InsightsHomePage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Insights</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Portfolio-level surfaces that span all assessments in your organisation.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={`/insights/${s.key}`}
            className="block rounded-lg border border-border bg-card p-5 hover:border-foreground/20 hover:bg-accent/50 transition-colors"
          >
            <h2 className="font-semibold text-lg">{s.label}</h2>
            <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
