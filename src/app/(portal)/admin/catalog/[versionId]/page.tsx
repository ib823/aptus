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
