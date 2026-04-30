import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Catalog Version Detail" };

const EDITION_LABELS: Record<string, string> = {
  PUBLIC: "Public Edition",
  PRIVATE: "Private Edition",
  ON_PREM: "On-Premise",
};

interface PageProps {
  params: Promise<{ versionId: string }>;
}

export default async function CatalogVersionDetailPage({ params }: PageProps) {
  const { versionId } = await params;

  const version = await prisma.scopeCatalogVersion.findUnique({
    where: { id: versionId },
    include: {
      _count: { select: { scopeItems: true, assessments: true, protocols: true } },
      protocols: {
        select: { id: true, name: true, version: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!version) notFound();

  // Functional area distribution
  const areaGroups = await prisma.scopeItem.groupBy({
    by: ["functionalArea"],
    where: { catalogVersionId: versionId },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  // Sample scope items (top 20 by step count)
  const sampleItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: versionId },
    orderBy: { totalSteps: "desc" },
    take: 20,
    select: {
      id: true,
      scopeCode: true,
      name: true,
      functionalArea: true,
      totalSteps: true,
    },
  });

  // Phase 13.6 — SAP API Hub evidence linked to this catalog edition.
  // Pulls APIs tagged for this catalog's edition + having scopeItemCodes
  // that overlap with at least one ScopeItem.scopeCode in this catalog.
  const editionField =
    version.edition === "PUBLIC"
      ? "appliesToPublic"
      : version.edition === "PRIVATE"
        ? "appliesToPrivate"
        : version.edition === "ON_PREM"
          ? "appliesToOnPrem"
          : null;
  const allCatalogScopeCodes = (
    await prisma.scopeItem.findMany({
      where: { catalogVersionId: versionId },
      select: { scopeCode: true },
    })
  ).map((s) => s.scopeCode);
  const apiCounts = editionField
    ? {
        total: await prisma.sapApiReference.count({ where: { [editionField]: true } }),
        released: await prisma.sapApiReference.count({
          where: { [editionField]: true, status: "Released" },
        }),
        beta: await prisma.sapApiReference.count({
          where: { [editionField]: true, status: "Beta" },
        }),
        deprecated: await prisma.sapApiReference.count({
          where: { [editionField]: true, status: "Deprecated" },
        }),
        // APIs that actually link to a scope item in THIS catalog
        linkedToCatalog:
          allCatalogScopeCodes.length > 0
            ? await prisma.sapApiReference.count({
                where: {
                  [editionField]: true,
                  scopeItemCodes: { hasSome: allCatalogScopeCodes },
                },
              })
            : 0,
      }
    : null;
  const topLinkedApis = editionField && allCatalogScopeCodes.length > 0
    ? await prisma.sapApiReference.findMany({
        where: {
          [editionField]: true,
          status: "Released",
          scopeItemCodes: { hasSome: allCatalogScopeCodes },
        },
        select: { apiId: true, apiName: true, status: true, scopeItemCodes: true, apiHubUrl: true },
        take: 10,
      })
    : [];

  return (
    <div className="max-w-5xl">
      <Link href="/admin/catalog" className="text-sm text-blue-600 hover:underline">
        ← All catalog versions
      </Link>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        {EDITION_LABELS[version.edition] ?? version.edition} — {version.version}
      </h1>
      <p className="text-base text-muted-foreground mb-8">
        {version.isActive ? "● Active" : "○ Deprecated"} · ingested{" "}
        {version.ingestedAt.toISOString().slice(0, 10)}
        {version.sourceArchiveHash ? ` · sha256 ${version.sourceArchiveHash.slice(0, 12)}…` : ""}
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{version._count.scopeItems.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Scope Items</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{version._count.assessments.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Pinned Assessments</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{version._count.protocols}</p>
          <p className="text-sm text-muted-foreground mt-1">Classification Protocols</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-card rounded-lg border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Scope Items by Functional Area
          </h3>
          <div className="space-y-2">
            {areaGroups.map((g) => (
              <div
                key={g.functionalArea}
                className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
              >
                <span className="text-sm text-foreground">{g.functionalArea}</span>
                <span className="text-sm font-medium text-foreground tabular-nums">{g._count.id}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Classification Protocols
          </h3>
          {version.protocols.length === 0 ? (
            <p className="text-sm text-muted-foreground">No protocols seeded for this catalog version.</p>
          ) : (
            <div className="space-y-2">
              {version.protocols.map((p) => (
                <div key={p.id} className="py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground">v{p.version}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {p.createdAt.toISOString().slice(0, 10)}
                    </span>
                    <span className={`text-xs ${p.isActive ? "text-green-700" : "text-muted-foreground"}`}>
                      {p.isActive ? "● Active" : "○ Inactive"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Phase 13.6 — SAP API Hub evidence card */}
      {apiCounts && (
        <div className="bg-card rounded-lg border border-border p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Linked SAP APIs (for grounding classifier verdicts)
            </h3>
            <span className="text-xs text-muted-foreground">
              edition filter: {version.edition}
            </span>
          </div>

          {apiCounts.total === 0 ? (
            <div className="text-sm text-muted-foreground">
              No SAP APIs ingested yet. Run{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                pnpm tsx scripts/import-sap-api-catalog.ts
              </code>{" "}
              after exporting the catalog from{" "}
              <a
                href="https://api.sap.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                api.sap.com
              </a>
              .
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="rounded border border-border p-3 text-center">
                  <p className="text-xl font-bold tabular-nums">{apiCounts.total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total tagged for {version.edition}</p>
                </div>
                <div className="rounded border border-border p-3 text-center">
                  <p className="text-xl font-bold text-green-700 tabular-nums">{apiCounts.released.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Released</p>
                </div>
                <div className="rounded border border-border p-3 text-center">
                  <p className="text-xl font-bold text-amber-700 tabular-nums">{apiCounts.beta.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Beta</p>
                </div>
                <div className="rounded border border-border p-3 text-center">
                  <p className="text-xl font-bold text-muted-foreground tabular-nums">{apiCounts.deprecated.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Deprecated</p>
                </div>
              </div>

              <div className="text-sm text-muted-foreground mb-3">
                {apiCounts.linkedToCatalog.toLocaleString()} of {apiCounts.total.toLocaleString()} APIs link
                to at least one scope item in this catalog version.
              </div>

              {topLinkedApis.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Sample (top 10 Released APIs linked to this catalog)
                  </p>
                  <div className="space-y-1.5">
                    {topLinkedApis.map((a) => (
                      <div
                        key={a.apiId}
                        className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 text-sm"
                      >
                        <a
                          href={a.apiHubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-600 hover:underline"
                        >
                          {a.apiId}
                        </a>
                        <span className="text-foreground flex-1 mx-3 truncate">{a.apiName}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          scopes: {a.scopeItemCodes.slice(0, 4).join(", ")}
                          {a.scopeItemCodes.length > 4 ? ` +${a.scopeItemCodes.length - 4}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-6 py-4 border-b border-border">
          Sample Scope Items (top 20 by step count)
        </h3>
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="px-6 py-3 font-medium text-muted-foreground">Code</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Name</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Functional Area</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Steps</th>
            </tr>
          </thead>
          <tbody>
            {sampleItems.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-6 py-3 font-mono text-foreground">{s.scopeCode}</td>
                <td className="px-6 py-3 text-foreground">{s.name}</td>
                <td className="px-6 py-3 text-muted-foreground">{s.functionalArea}</td>
                <td className="px-6 py-3 text-right tabular-nums">{s.totalSteps.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
