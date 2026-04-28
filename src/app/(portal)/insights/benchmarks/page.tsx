/**
 * Phase 8 — AD-9: portfolio Benchmarks surface.
 *
 * Industry benchmarking dashboard with cohort selection. Scaffold —
 * cross-assessment cohort component lands in follow-up.
 */

export default function PortfolioBenchmarksPage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Benchmarks</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Industry benchmarking with cohort selection. Compares your assessments
        against industry-peer assessments in the same cohort.
      </p>
      <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
        Cohort dashboard component is scheduled for the Phase 8 frontend
        follow-up. The existing per-assessment <code>BenchmarkComparison</code>{" "}
        will be hosted here scoped via cohort filter.
      </div>
    </div>
  );
}
