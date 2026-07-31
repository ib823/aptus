/**
 * Phase 8 — AD-9: portfolio Triggers surface.
 *
 * Lifecycle triggers across all assessments — SAP updates, regulatory
 * changes, scope drift detection.
 *
 * DELIBERATELY UNLINKED from navigation until the aggregation client
 * lands — reachable by typed URL only. Linking a page whose body says
 * "scheduled for a follow-up" would advertise a feature that is not
 * there; hiding the route entirely would 404 a documented Phase 8
 * landing point. Unlinked-but-alive is the honest middle.
 */

export default function PortfolioTriggersPage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Lifecycle Triggers</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Cross-assessment view of detected triggers — SAP catalog updates,
        regulatory changes, scope drift, organisational changes.
      </p>
      <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
        Aggregation client lands in Phase 8 frontend follow-up. The existing
        per-assessment <code>TriggersClient</code> will be hosted here with
        cross-assessment summary above the per-assessment drill-down.
      </div>
    </div>
  );
}
