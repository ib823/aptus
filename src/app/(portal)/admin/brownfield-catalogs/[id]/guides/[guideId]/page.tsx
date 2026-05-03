import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Brownfield Guide" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; guideId: string }>;
}

export default async function GuideDetailPage({ params }: PageProps) {
  const { id, guideId } = await params;

  const guide = await prisma.brownfieldGuide.findUnique({
    where: { id: guideId },
    include: {
      sections: {
        orderBy: [{ pageStart: "asc" }, { sequence: "asc" }],
      },
    },
  });
  if (!guide || (guide.catalogVersionId && guide.catalogVersionId !== id)) notFound();

  // Build hierarchical tree from flat sections
  type SectionNode = (typeof guide.sections)[number] & { children: SectionNode[] };
  const byId = new Map<string, SectionNode>();
  const roots: SectionNode[] = [];
  for (const s of guide.sections) {
    byId.set(s.id, { ...s, children: [] });
  }
  for (const s of guide.sections) {
    const node = byId.get(s.id)!;
    if (s.parentSectionId && byId.has(s.parentSectionId)) {
      byId.get(s.parentSectionId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function renderNode(node: SectionNode, depth: number): React.ReactElement {
    return (
      <li key={node.id} className="py-1">
        <div
          className="flex items-baseline gap-2 text-sm"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          <span className="text-xs font-mono text-muted-foreground w-12 text-right shrink-0">
            §{node.sectionRef}
          </span>
          <span className="text-foreground flex-1">{node.title}</span>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            p.{node.pageStart}
            {node.pageEnd && node.pageEnd !== node.pageStart && <>–{node.pageEnd}</>}
          </span>
        </div>
        {node.children.length > 0 && (
          <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <div className="max-w-5xl">
      <Link
        href={`/admin/brownfield-catalogs/${id}`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to catalog
      </Link>
      <h1 className="text-2xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        {guide.title}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {guide.sourceDocument} · {guide.mimeType} · {(guide.fileSizeBytes / 1024).toFixed(1)} KB ·
        sha256 {guide.sha256.slice(0, 12)}…
        {guide.industryTag && (
          <>
            {" "}
            ·{" "}
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
              industry: {guide.industryTag}
            </span>
          </>
        )}
        {guide.conversionPath && (
          <>
            {" "}
            ·{" "}
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
              path: {guide.conversionPath}
            </span>
          </>
        )}
      </p>

      <div className="flex gap-3 mb-6">
        <a
          href={`/api/brownfield-guides/${guide.id}/content`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded border border-blue-500 bg-blue-50 text-sm text-blue-700 hover:bg-blue-100"
        >
          📄 Open / Download
        </a>
        {guide.sourceUrl && (
          <a
            href={guide.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded border border-input bg-background text-sm hover:bg-muted/50"
          >
            🔗 Source on SAP
          </a>
        )}
      </div>

      {guide.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-xs text-amber-900">
          <p className="font-semibold mb-1">Ingest notes</p>
          <p className="whitespace-pre-wrap">{guide.notes}</p>
        </div>
      )}

      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Table of Contents · {guide.sections.length} section{guide.sections.length === 1 ? "" : "s"}
        </h3>
        {roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No TOC sections parsed from this guide.
          </p>
        ) : (
          <ul className="space-y-0.5">{roots.map((r) => renderNode(r, 0))}</ul>
        )}
      </div>
    </div>
  );
}
