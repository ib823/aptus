import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Brownfield Catalog Detail" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BrownfieldCatalogDetailPage({ params }: PageProps) {
  const { id } = await params;

  const catalog = await prisma.brownfieldCatalogVersion.findUnique({
    where: { id },
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
  if (!catalog) notFound();

  // Application area distribution (top 15 by item count)
  const areaGroups = await prisma.simplificationItem.groupBy({
    by: ["applicationArea"],
    where: { catalogVersionId: id },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 15,
  });

  // Top 10 LOBs (root-level only — those without a parent)
  const topLobs = await prisma.brownfieldLineOfBusiness.findMany({
    where: { catalogVersionId: id, parentSapId: null },
    take: 15,
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, lifecycleStatus: true },
  });

  // Pre-check note role breakdown
  const noteRoleGroups = await prisma.preCheckNote.groupBy({
    by: ["role"],
    where: { catalogVersionId: id },
    _count: { id: true },
    orderBy: { role: "asc" },
  });

  // Narrative coverage (count of SimplificationItem rows with a parsed narrative)
  const narrativeCount = await prisma.simplificationItemNarrative.count({
    where: { simplificationItem: { catalogVersionId: id } },
  });

  // Sample simplification items (first 10 alphabetical by titleEn)
  const sampleItems = await prisma.simplificationItem.findMany({
    where: { catalogVersionId: id },
    orderBy: { titleEn: "asc" },
    take: 10,
    select: {
      id: true,
      sitemId: true,
      titleEn: true,
      applicationArea: true,
      procStatus: true,
      checkCondition: true,
      _count: { select: { checks: true, notes: true } },
    },
  });

  return (
    <div className="max-w-6xl">
      <Link
        href="/admin/brownfield-catalogs"
        className="text-sm text-blue-600 hover:underline"
      >
        ← All brownfield catalogs
      </Link>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        {catalog.label ?? `SIC ${catalog.snapshotDate.toISOString().slice(0, 10)}`}
      </h1>
      <p className="text-base text-muted-foreground mb-6">
        {catalog.isActive ? "● Active" : "○ Deprecated"} · ingested{" "}
        {catalog.ingestedAt.toISOString().slice(0, 10)} ·{" "}
        snapshot {catalog.snapshotDate.toISOString().slice(0, 10)}
        {catalog.applicationVersion && (
          <> · SIC app v{catalog.applicationVersion}</>
        )}
      </p>

      {/* Provenance card */}
      <div className="bg-card rounded-lg border border-border p-5 mb-8">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Provenance
        </h3>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Source archive SHA-256</dt>
            <dd className="font-mono text-xs text-foreground break-all">
              {catalog.sourceArchiveHash}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Source system ID</dt>
            <dd className="text-foreground">
              {catalog.sourceSystemId ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Source archive path</dt>
            <dd className="font-mono text-xs text-foreground break-all">
              {catalog.sourceArchivePath ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">SIC application version</dt>
            <dd className="text-foreground">
              {catalog.applicationVersion ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
        </dl>
      </div>

      {/* Counts grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Link
          href={`/admin/brownfield-catalogs/${id}/items`}
          className="bg-card rounded-lg border border-border p-6 text-center hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <p className="text-3xl font-bold text-foreground">
            {catalog._count.simplificationItems.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Simplification Items →</p>
        </Link>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">
            {catalog._count.simplificationItemChecks.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground mt-1">SI-Check Rules</p>
        </div>
        <Link
          href={`/admin/brownfield-catalogs/${id}/notes`}
          className="bg-card rounded-lg border border-border p-6 text-center hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <p className="text-3xl font-bold text-foreground">
            {catalog._count.preCheckNotes.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Pre-Check Notes →</p>
        </Link>
        <Link
          href={`/admin/brownfield-catalogs/${id}/business-functions`}
          className="bg-card rounded-lg border border-border p-6 text-center hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <p className="text-3xl font-bold text-foreground">
            {catalog._count.businessFunctionDispositions.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Business Functions →</p>
        </Link>
      </div>

      {/* Narrative coverage + search */}
      <div className="bg-card rounded-lg border border-border p-5 mb-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Narrative Corpus (parsed from SIMPL_OP2025.pdf)
            </h3>
            <p className="text-sm text-foreground">
              <span className="font-bold text-2xl tabular-nums">
                {narrativeCount.toLocaleString()}
              </span>{" "}
              of {catalog._count.simplificationItems.toLocaleString()} items have a parsed
              Symptom / Description / Solution / Required Actions / Relevancy / Transport
              narrative.{" "}
              {narrativeCount === 0 && (
                <span className="text-muted-foreground">
                  Run{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    pnpm tsx scripts/ingest/brownfield-narrative-adapter.ts
                  </code>
                  .
                </span>
              )}
            </p>
          </div>
          {narrativeCount > 0 && (
            <Link
              href={`/admin/brownfield-catalogs/${id}/search`}
              className="px-4 py-2 rounded border border-blue-500 bg-blue-50 text-sm text-blue-700 hover:bg-blue-100 shrink-0"
            >
              🔎 Search narratives →
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-2xl font-bold text-foreground">
            {catalog._count.applicationAreas.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Application Areas</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-2xl font-bold text-foreground">
            {catalog._count.linesOfBusiness.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Lines of Business</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-2xl font-bold text-foreground">
            {catalog._count.relatedSapNotes.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Related SAP Notes</p>
        </div>
      </div>

      {/* Distribution panels */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-card rounded-lg border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Top Application Areas
          </h3>
          {areaGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items.</p>
          ) : (
            <div className="space-y-2">
              {areaGroups.map((g) => (
                <Link
                  key={g.applicationArea}
                  href={`/admin/brownfield-catalogs/${id}/items?area=${encodeURIComponent(g.applicationArea)}`}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 hover:text-blue-600"
                >
                  <span className="text-sm">{g.applicationArea}</span>
                  <span className="text-sm font-medium tabular-nums">{g._count.id}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-lg border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Pre-Check Notes by Role
          </h3>
          {noteRoleGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pre-check notes.</p>
          ) : (
            <div className="space-y-2">
              {noteRoleGroups.map((g) => (
                <div
                  key={g.role}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                >
                  <span className="text-sm font-mono text-xs">{g.role}</span>
                  <span className="text-sm font-medium tabular-nums">{g._count.id}</span>
                </div>
              ))}
            </div>
          )}
          <Link
            href={`/admin/brownfield-catalogs/${id}/notes`}
            className="block text-xs text-blue-600 hover:underline mt-3"
          >
            View all pre-check notes →
          </Link>
        </div>
      </div>

      {/* LOB list */}
      {topLobs.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-6 mb-8">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Lines of Business (root-level, alphabetical, first 15)
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {topLobs.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-1 text-sm">
                <span className="text-foreground truncate">{l.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{l.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample items */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Sample Simplification Items (first 10 alphabetical)
          </h3>
          <Link
            href={`/admin/brownfield-catalogs/${id}/items`}
            className="text-xs text-blue-600 hover:underline"
          >
            View all {catalog._count.simplificationItems.toLocaleString()} →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="px-6 py-3 font-medium text-muted-foreground">SItem ID</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Title</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Application Area</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Checks</th>
            </tr>
          </thead>
          <tbody>
            {sampleItems.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-6 py-3 font-mono text-xs text-foreground">
                  <Link
                    href={`/admin/brownfield-catalogs/${id}/items/${s.id}`}
                    className="hover:underline text-blue-600"
                  >
                    {s.sitemId}
                  </Link>
                </td>
                <td className="px-6 py-3 text-foreground">{s.titleEn}</td>
                <td className="px-6 py-3 text-muted-foreground">{s.applicationArea}</td>
                <td className="px-6 py-3 text-xs text-muted-foreground">{s.procStatus}</td>
                <td className="px-6 py-3 text-right tabular-nums">{s._count.checks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
