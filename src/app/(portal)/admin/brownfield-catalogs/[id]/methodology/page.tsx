import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Conversion Methodology" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MethodologyPage({ params }: PageProps) {
  const { id } = await params;

  const catalog = await prisma.brownfieldCatalogVersion.findUnique({
    where: { id },
    select: { id: true, label: true, snapshotDate: true },
  });
  if (!catalog) notFound();

  const phases = await prisma.conversionMethodologyPhase.findMany({
    where: { catalogVersionId: id },
    orderBy: { phaseSequence: "asc" },
    include: {
      deliverables: { orderBy: { sequence: "asc" } },
    },
  });

  const totalDeliverables = phases.reduce((s, p) => s + p.deliverables.length, 0);

  return (
    <div className="max-w-5xl">
      <Link
        href={`/admin/brownfield-catalogs/${id}`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to catalog
      </Link>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        Conversion Methodology
      </h1>
      <p className="text-base text-muted-foreground mb-6">
        SAP Activate System Conversion roadmap · {phases.length} phases · {totalDeliverables} deliverables ·{" "}
        {catalog.label ?? `SIC ${catalog.snapshotDate.toISOString().slice(0, 10)}`}
      </p>

      {phases.length === 0 ? (
        <div className="bg-card rounded-lg border border-border border-dashed p-12 text-center">
          <p className="text-base text-muted-foreground">
            No methodology phases ingested yet for this catalog.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded">
              pnpm tsx scripts/ingest/sap-activate-roadmap-adapter.ts
            </code>
          </p>
        </div>
      ) : (
        <>
          {/* Provenance disclosure */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 text-xs text-amber-900">
            <p className="font-semibold mb-1">Provenance</p>
            <p>
              The SAP Activate Roadmap Viewer SPA (
              <code>roadmapviewer-supportportal.dispatcher.hana.ondemand.com</code>) returned HTTP
              503 from this codespace and the methodology JSON API requires SAML SSO. The phase
              structure shown below is therefore <strong>derived from the chapter structure of the
              SAP-published Conversion Guide PDF</strong> (CONV_PE2025.pdf, sha256-verified). Each
              deliverable cites its source PDF section.
            </p>
          </div>

          {/* Phases timeline */}
          <div className="space-y-6">
            {phases.map((phase) => (
              <div key={phase.id} className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-blue-600 tabular-nums">
                    {phase.phaseSequence}
                  </span>
                  <h2 className="text-lg font-semibold text-foreground">{phase.phaseName}</h2>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {phase.deliverables.length} deliverable{phase.deliverables.length === 1 ? "" : "s"}
                  </span>
                </div>
                {phase.phaseDescription && (
                  <p className="px-6 py-3 text-sm text-foreground/80 leading-relaxed border-b border-border/50">
                    {phase.phaseDescription}
                  </p>
                )}
                {phase.deliverables.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-muted-foreground">
                    No deliverables recorded.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {phase.deliverables.map((d) => (
                      <li key={d.id} className="px-6 py-3">
                        <div className="flex items-start gap-3 text-sm">
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-6">
                            {d.sequence}.
                          </span>
                          <div className="flex-1">
                            <p className="text-foreground font-medium">{d.deliverableName}</p>
                            {d.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
