import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "SAP Catalog Versions" };

const EDITION_LABELS: Record<string, string> = {
  PUBLIC: "Public",
  PRIVATE: "Private",
  ON_PREM: "On-Prem",
};
const EDITION_COLORS: Record<string, string> = {
  PUBLIC: "bg-blue-100 text-blue-700",
  PRIVATE: "bg-purple-100 text-purple-700",
  ON_PREM: "bg-amber-100 text-amber-700",
};

export default async function CatalogVersionsPage() {
  // Phase 13.4 — replaces the static "Version 2508" header with a real
  // catalog-versions list driven by ScopeCatalogVersion rows.
  const versions = await prisma.scopeCatalogVersion.findMany({
    orderBy: [{ edition: "asc" }, { ingestedAt: "desc" }],
    include: {
      _count: { select: { scopeItems: true, assessments: true, protocols: true } },
    },
  });

  // Aggregate totals
  const totalScopeItems = versions.reduce((s, v) => s + v._count.scopeItems, 0);
  const totalAssessments = versions.reduce((s, v) => s + v._count.assessments, 0);
  const activeCount = versions.filter((v) => v.isActive).length;

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-1">SAP Catalog</h1>
      <p className="text-base text-muted-foreground mb-8">
        SAP S/4HANA Cloud Best Practices catalogs ingested into Aptus. Each assessment is pinned to a specific
        edition + version so verdicts remain reproducible across SAP releases.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{versions.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Catalog Versions ({activeCount} active)</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{totalScopeItems.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Total Scope Items</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{totalAssessments.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Pinned Assessments</p>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-6 py-3 font-medium text-muted-foreground">Edition</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Version</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Scope Items</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Assessments</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Protocols</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Ingested</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${EDITION_COLORS[v.edition] ?? "bg-gray-100 text-gray-700"}`}>
                    {EDITION_LABELS[v.edition] ?? v.edition}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-foreground">
                  <Link href={`/admin/catalog/${v.id}`} className="hover:underline text-blue-600">
                    {v.version}
                  </Link>
                </td>
                <td className="px-6 py-4 text-right tabular-nums">{v._count.scopeItems.toLocaleString()}</td>
                <td className="px-6 py-4 text-right tabular-nums">{v._count.assessments.toLocaleString()}</td>
                <td className="px-6 py-4 text-right tabular-nums">{v._count.protocols}</td>
                <td className="px-6 py-4 text-muted-foreground">
                  {v.ingestedAt.toISOString().slice(0, 10)}
                </td>
                <td className="px-6 py-4">
                  {v.isActive ? (
                    <span className="text-xs text-green-700">● Active</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">○ Deprecated</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {versions.length === 0 && (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <p className="text-base text-muted-foreground">No catalog versions ingested yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">tsx scripts/ingest/dispatcher.ts &lt;archive.zip&gt;</code> to ingest a SAP Best Practices archive.
          </p>
        </div>
      )}
    </div>
  );
}
