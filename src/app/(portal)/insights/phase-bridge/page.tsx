/**
 * Phase 8 — AD-9: portfolio Phase Bridge surface.
 *
 * Replaces the misplaced /assessment/[id]/cross-phase route — that route
 * fetched PhaseLink data across multiple assessments while sitting under
 * a single one. This is its proper home.
 */

export default function PortfolioPhaseBridgePage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Phase Bridge</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Tracks phase transitions across assessments. When an assessment
        progresses from Phase 1 → Phase 2, this surface shows the lineage,
        what changed, and any open carry-forwards.
      </p>
      <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
        The existing <code>CrossPhaseAnalytics</code> client (currently mis-
        placed under <code>/assessment/[id]/cross-phase</code>) will be re-
        hosted here in the Phase 8 frontend follow-up. The old route
        redirects here.
      </div>
    </div>
  );
}
