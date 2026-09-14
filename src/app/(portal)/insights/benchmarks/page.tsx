/**
 * Phase 8 — AD-9: portfolio Benchmarks surface.
 *
 * Cross-engagement comparison dashboard with cohort selection. Scaffold —
 * cross-assessment cohort component lands in follow-up.
 *
 * The cohort is ABeam's own engagement records, never an external panel. This
 * page said "industry benchmarking" against "industry-peer assessments" until
 * 2026-09-14, which described a data source the product does not have.
 *
 * DELIBERATELY UNLINKED from navigation until the aggregation client
 * lands — reachable by typed URL only. Linking a page whose body says
 * "scheduled for a follow-up" would advertise a feature that is not
 * there; hiding the route entirely would 404 a documented Phase 8
 * landing point. Unlinked-but-alive is the honest middle.
 */

export default function PortfolioBenchmarksPage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Benchmarks</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Comparison with cohort selection. Compares your assessments against
        other ABeam engagements recorded in Aptus in the same cohort, not
        against an external benchmarking panel.
      </p>
      <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
        Cohort dashboard component is scheduled for the Phase 8 frontend
        follow-up. The existing per-assessment <code>BenchmarkComparison</code>{" "}
        will be hosted here scoped via cohort filter.
      </div>
    </div>
  );
}
