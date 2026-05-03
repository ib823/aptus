import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Brownfield Assessments" };
export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scanning: "bg-blue-100 text-blue-700",
  reviewed: "bg-amber-100 text-amber-700",
  signed_off: "bg-green-100 text-green-700",
};

export default async function BrownfieldAssessmentsPage() {
  const assessments = await prisma.brownfieldAssessment.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      catalogVersion: {
        select: { label: true, snapshotDate: true },
      },
      _count: {
        select: { baselineSnapshots: true },
      },
    },
  });

  // Per-assessment finding counts (do this in a single follow-up query for perf)
  const assessmentIds = assessments.map((a) => a.id);
  const findingCounts = await prisma.ewaFinding.groupBy({
    by: ["snapshotId"],
    where: { snapshot: { brownfieldAssessmentId: { in: assessmentIds } } },
    _count: { id: true },
  });
  // Map snapshotId → count, then aggregate per assessment
  const snapshotToAssessment = await prisma.systemBaselineSnapshot.findMany({
    where: { brownfieldAssessmentId: { in: assessmentIds } },
    select: { id: true, brownfieldAssessmentId: true },
  });
  const snapToAssessment = new Map(
    snapshotToAssessment.map((s) => [s.id, s.brownfieldAssessmentId]),
  );
  const findingsByAssessment = new Map<string, number>();
  for (const fc of findingCounts) {
    const aId = snapToAssessment.get(fc.snapshotId);
    if (!aId) continue;
    findingsByAssessment.set(aId, (findingsByAssessment.get(aId) ?? 0) + fc._count.id);
  }

  const totalFindings = Array.from(findingsByAssessment.values()).reduce((s, n) => s + n, 0);

  return (
    <div className="max-w-6xl">
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-1">
        Brownfield Assessments
      </h1>
      <p className="text-base text-muted-foreground mb-8">
        Per-customer SAP ECC → S/4HANA conversion assessments. Each assessment pins to a brownfield
        catalog snapshot and accumulates customer-specific baseline scans (EWA, ATC, SRC).
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{assessments.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Assessments</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">
            {assessments.reduce((s, a) => s + a._count.baselineSnapshots, 0)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Baseline Snapshots</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{totalFindings.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Total Findings</p>
        </div>
      </div>

      {assessments.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <p className="text-base text-muted-foreground">No brownfield assessments yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
              pnpm tsx scripts/ingest/brownfield-ewa-adapter.ts &lt;ewa.doc&gt;
            </code>{" "}
            to ingest a customer&apos;s EarlyWatch Alert report — it auto-creates a
            BrownfieldAssessment for that customer + system if none exists.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">SID</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Source Product</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">DB</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Catalog</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Snapshots
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Findings</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => {
                const findings = findingsByAssessment.get(a.id) ?? 0;
                const statusColor =
                  STATUS_COLORS[a.status] ?? "bg-gray-100 text-gray-700";
                return (
                  <tr key={a.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/brownfield-assessments/${a.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {a.customerName}
                      </Link>
                      {a.sourceCountry && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {a.sourceCountry}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {a.sourceSystemId ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.sourceProduct ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.sourceDatabase ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.catalogVersion.label ??
                        a.catalogVersion.snapshotDate.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {a._count.baselineSnapshots}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{findings}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}
                      >
                        {a.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
