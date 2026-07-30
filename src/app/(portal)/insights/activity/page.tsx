/**
 * Phase 8 — AD-9: portfolio Activity surface.
 *
 * Cross-assessment activity feed. Per-assessment filter via
 * ?assessmentId=X. Currently a scaffold — the existing
 * src/components/collaboration/ActivityFeed.tsx is assessment-scoped;
 * the cross-assessment client will land in a follow-up.
 */

export default function PortfolioActivityPage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cross-assessment activity feed. Per-assessment filtering is supported via{" "}
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">?assessmentId=X</code>.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
        Cross-assessment activity client component is scheduled for the
        Phase 8 frontend follow-up. The route + nav placement land in
        this PR; the rich aggregation client is additive.
      </div>
    </div>
  );
}
