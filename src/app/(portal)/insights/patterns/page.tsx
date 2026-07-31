/**
 * Phase 8 — AD-9: portfolio Pattern Library.
 *
 * Cross-assessment aggregation: "in financial-services SAP Public
 * Edition implementations, scope item X is C 80% of the time — based
 * on N assessments." Differentiator from "consultant tool" → "evidence
 * platform with priors."
 *
 * Aggregates over ClassificationVerdict rows + Assessment.industry.
 *
 * DELIBERATELY UNLINKED from navigation until the aggregation client
 * lands — reachable by typed URL only. Linking a page whose body says
 * "scheduled for a follow-up" would advertise a feature that is not
 * there; hiding the route entirely would 404 a documented Phase 8
 * landing point. Unlinked-but-alive is the honest middle.
 */

export default function PortfolioPatternsPage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Pattern Library</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Aggregates classifications across all your assessments to surface
        priors: <em>&quot;For Financial Services in SAP S/4HANA Cloud Public
        Edition 2602, scope item J60 is OOTB in 90% of cases.&quot;</em>
      </p>
      <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
        Pattern aggregation backend reads from Phase 3{" "}
        <code>ClassificationVerdict</code> rows. Frontend lands in the
        Phase 8 frontend follow-up; the underlying SQL is straightforward
        (<code>GROUP BY industry, scope_item_id, verdict_bucket</code>).
      </div>
    </div>
  );
}
