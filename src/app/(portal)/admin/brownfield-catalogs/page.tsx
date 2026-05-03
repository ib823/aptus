import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Brownfield Catalogs" };
export const dynamic = "force-dynamic";

export default async function BrownfieldCatalogsPage() {
  const catalogs = await prisma.brownfieldCatalogVersion.findMany({
    orderBy: [{ isActive: "desc" }, { ingestedAt: "desc" }],
    include: {
      _count: {
        select: {
          simplificationItems: true,
          simplificationItemChecks: true,
          relatedSapNotes: true,
          linesOfBusiness: true,
          applicationAreas: true,
          preCheckNotes: true,
          businessFunctionDispositions: true,
          brownfieldAssessments: true,
        },
      },
    },
  });

  const totalSitems = catalogs.reduce((s, c) => s + c._count.simplificationItems, 0);
  const totalChecks = catalogs.reduce((s, c) => s + c._count.simplificationItemChecks, 0);
  const totalAssessments = catalogs.reduce((s, c) => s + c._count.brownfieldAssessments, 0);
  const activeCount = catalogs.filter((c) => c.isActive).length;

  return (
    <div className="max-w-6xl">
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-1">
        Brownfield Catalogs
      </h1>
      <p className="text-base text-muted-foreground mb-8">
        SAP Simplification Item Catalog (SIC) snapshots ingested into Aptus. Each brownfield
        assessment is pinned to a specific catalog snapshot so verdicts remain reproducible
        across SAP catalog refreshes.
      </p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{catalogs.length}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Catalogs ({activeCount} active)
          </p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{totalSitems.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Simplification Items</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{totalChecks.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">SI-Check Rules</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{totalAssessments.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Pinned Assessments</p>
        </div>
      </div>

      {catalogs.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <p className="text-base text-muted-foreground">No brownfield catalogs ingested yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
              pnpm tsx scripts/ingest/brownfield-sic-adapter.ts &lt;sic-archive.zip&gt;
            </code>{" "}
            to ingest a Simplification Item Catalog archive downloaded from{" "}
            <a
              href="https://launchpad.support.sap.com/#sic"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              launchpad.support.sap.com/#sic
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Snapshot</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Label</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Items</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Checks</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">Notes</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">BFR</th>
                <th className="px-6 py-3 font-medium text-muted-foreground text-right">
                  Assessments
                </th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Ingested</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {catalogs.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-6 py-4 font-mono text-foreground">
                    <Link
                      href={`/admin/brownfield-catalogs/${c.id}`}
                      className="hover:underline text-blue-600"
                    >
                      {c.snapshotDate.toISOString().slice(0, 10)}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-foreground">
                    {c.label ?? <span className="text-muted-foreground">(no label)</span>}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums">
                    {c._count.simplificationItems.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums">
                    {c._count.simplificationItemChecks.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums">
                    {c._count.relatedSapNotes.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums">
                    {c._count.businessFunctionDispositions.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums">
                    {c._count.brownfieldAssessments.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {c.ingestedAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-6 py-4">
                    {c.isActive ? (
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
      )}
    </div>
  );
}
