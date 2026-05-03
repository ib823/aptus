import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Brownfield Verdicts" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    bucket?: string;
    confidence?: string;
    source?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 50;

const BUCKET_META: Record<string, { label: string; color: string }> = {
  A: { label: "Auto / SUM", color: "bg-green-100 text-green-800" },
  C: { label: "Configuration", color: "bg-blue-100 text-blue-800" },
  R: { label: "Code Adapt", color: "bg-amber-100 text-amber-800" },
  D: { label: "Data Prep", color: "bg-purple-100 text-purple-800" },
  "N/R": { label: "Not Relevant", color: "bg-slate-100 text-slate-700" },
  B: { label: "Blocker", color: "bg-red-100 text-red-800" },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-700",
  medium: "text-amber-700",
  low: "text-red-700",
};

const SOURCE_COLORS: Record<string, string> = {
  RULE: "bg-cyan-50 text-cyan-700 border-cyan-200",
  CLAUDE_CLI: "bg-purple-50 text-purple-700 border-purple-200",
  MANUAL: "bg-amber-50 text-amber-700 border-amber-200",
  REIMPORT: "bg-slate-50 text-slate-700 border-slate-200",
};

export default async function BrownfieldVerdictsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const bucketFilter = (sp.bucket ?? "").trim();
  const confidenceFilter = (sp.confidence ?? "").trim();
  const sourceFilter = (sp.source ?? "").trim();
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const assessment = await prisma.brownfieldAssessment.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      customerName: true,
      sourceSystemId: true,
      sourceProduct: true,
      status: true,
      catalogVersion: { select: { id: true, label: true, snapshotDate: true } },
    },
  });
  if (!assessment) notFound();

  // Counts (always for current verdicts only)
  const allCurrentCount = await prisma.brownfieldVerdict.count({
    where: { brownfieldAssessmentId: id, isCurrent: true },
  });

  const byBucket = await prisma.brownfieldVerdict.groupBy({
    by: ["bucket"],
    where: { brownfieldAssessmentId: id, isCurrent: true },
    _count: { id: true },
  });
  const bySource = await prisma.brownfieldVerdict.groupBy({
    by: ["source"],
    where: { brownfieldAssessmentId: id, isCurrent: true },
    _count: { id: true },
  });
  const byConfidence = await prisma.brownfieldVerdict.groupBy({
    by: ["confidence"],
    where: { brownfieldAssessmentId: id, isCurrent: true },
    _count: { id: true },
  });

  // List of latest passes for context
  const passes = await prisma.brownfieldClassificationPass.findMany({
    where: { brownfieldAssessmentId: id },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: {
      id: true,
      startedAt: true,
      completedAt: true,
      actor: true,
      actorRole: true,
      summaryJson: true,
      protocolVersion: { select: { name: true, version: true } },
    },
  });

  const verdictWhere: Prisma.BrownfieldVerdictWhereInput = {
    brownfieldAssessmentId: id,
    isCurrent: true,
  };
  if (bucketFilter) verdictWhere.bucket = bucketFilter;
  if (confidenceFilter) verdictWhere.confidence = confidenceFilter;
  if (sourceFilter) verdictWhere.source = sourceFilter;

  const filteredCount = await prisma.brownfieldVerdict.count({ where: verdictWhere });
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);

  const verdicts = await prisma.brownfieldVerdict.findMany({
    where: verdictWhere,
    orderBy: [{ bucket: "asc" }, { simplificationItem: { titleEn: "asc" } }],
    skip: (clampedPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      simplificationItem: {
        select: { id: true, sitemId: true, titleEn: true, applicationArea: true },
      },
    },
  });

  const baseQuery = new URLSearchParams();
  if (bucketFilter) baseQuery.set("bucket", bucketFilter);
  if (confidenceFilter) baseQuery.set("confidence", confidenceFilter);
  if (sourceFilter) baseQuery.set("source", sourceFilter);
  function pageHref(p: number): string {
    const q = new URLSearchParams(baseQuery);
    q.set("page", String(p));
    return `/admin/brownfield-assessments/${id}/verdicts?${q.toString()}`;
  }

  return (
    <div className="max-w-6xl">
      <Link
        href={`/admin/brownfield-assessments/${id}`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to assessment
      </Link>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        Brownfield Verdicts — {assessment.customerName}
      </h1>
      <p className="text-base text-muted-foreground mb-6">
        Current classification per Simplification Item ·{" "}
        {allCurrentCount.toLocaleString()} of{" "}
        {/* total catalog item count */}items classified ·{" "}
        pinned to{" "}
        <Link
          href={`/admin/brownfield-catalogs/${assessment.catalogVersion.id}`}
          className="text-blue-600 hover:underline"
        >
          {assessment.catalogVersion.label ??
            assessment.catalogVersion.snapshotDate.toISOString().slice(0, 10)}
        </Link>
      </p>

      {/* Bucket distribution */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        {(["A", "C", "R", "D", "N/R", "B"] as const).map((b) => {
          const count = byBucket.find((g) => g.bucket === b)?._count.id ?? 0;
          const meta = BUCKET_META[b]!;
          return (
            <Link
              key={b}
              href={`/admin/brownfield-assessments/${id}/verdicts?bucket=${encodeURIComponent(b)}`}
              className={`bg-card rounded-lg border border-border p-4 text-center hover:border-blue-500 transition-all ${bucketFilter === b ? "ring-2 ring-blue-500" : ""}`}
            >
              <p className="text-2xl font-bold text-foreground">{count.toLocaleString()}</p>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-2 ${meta.color}`}
              >
                {b}
              </span>
              <p className="text-xs text-muted-foreground mt-1">{meta.label}</p>
            </Link>
          );
        })}
      </div>

      {/* Source + confidence chips */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            By source
          </h3>
          <div className="flex flex-wrap gap-2">
            {bySource.map((s) => {
              const cls = SOURCE_COLORS[s.source] ?? "bg-gray-50 text-gray-700 border-gray-200";
              return (
                <Link
                  key={s.source}
                  href={`/admin/brownfield-assessments/${id}/verdicts?source=${encodeURIComponent(s.source)}`}
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${cls}`}
                >
                  {s.source} ({s._count.id})
                </Link>
              );
            })}
            {bySource.length === 0 && (
              <span className="text-xs text-muted-foreground">No verdicts yet</span>
            )}
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            By confidence
          </h3>
          <div className="flex flex-wrap gap-2">
            {byConfidence.map((c) => {
              const label = c.confidence ?? "(none)";
              const color = c.confidence ? CONFIDENCE_COLORS[c.confidence] ?? "" : "text-muted-foreground";
              return (
                <Link
                  key={label}
                  href={`/admin/brownfield-assessments/${id}/verdicts?confidence=${encodeURIComponent(label)}`}
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs border border-border ${color}`}
                >
                  {label} ({c._count.id})
                </Link>
              );
            })}
            {byConfidence.length === 0 && (
              <span className="text-xs text-muted-foreground">No verdicts yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Recent passes */}
      {passes.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Recent classification passes
          </h3>
          <div className="space-y-2">
            {passes.map((p) => {
              const summary = (p.summaryJson as Record<string, unknown> | null) ?? null;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">{p.id.slice(-12)}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      · {p.protocolVersion.name} v{p.protocolVersion.version}
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">· {p.actorRole}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.startedAt.toISOString().slice(0, 10)}
                    {p.completedAt ? " ✓" : " (in progress)"}
                    {summary && summary.ruled !== undefined && (
                      <> · ruled {String(summary.ruled)}</>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <form
        method="get"
        action={`/admin/brownfield-assessments/${id}/verdicts`}
        className="bg-card rounded-lg border border-border p-3 mb-4 flex flex-wrap items-end gap-3"
      >
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1" htmlFor="bucket-filter">
            Bucket
          </label>
          <select
            id="bucket-filter"
            name="bucket"
            defaultValue={bucketFilter}
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          >
            <option value="">— all —</option>
            {Object.keys(BUCKET_META).map((b) => (
              <option key={b} value={b}>
                {b} — {BUCKET_META[b]!.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1" htmlFor="conf-filter">
            Confidence
          </label>
          <select
            id="conf-filter"
            name="confidence"
            defaultValue={confidenceFilter}
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          >
            <option value="">— all —</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1" htmlFor="src-filter">
            Source
          </label>
          <select
            id="src-filter"
            name="source"
            defaultValue={sourceFilter}
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          >
            <option value="">— all —</option>
            <option value="RULE">RULE</option>
            <option value="CLAUDE_CLI">CLAUDE_CLI</option>
            <option value="MANUAL">MANUAL</option>
            <option value="REIMPORT">REIMPORT</option>
          </select>
        </div>
        <button type="submit" className="px-3 py-1.5 rounded border border-input bg-background text-sm hover:bg-muted/50">
          Apply
        </button>
        <Link
          href={`/admin/brownfield-assessments/${id}/verdicts`}
          className="px-3 py-1.5 rounded border border-input bg-background text-sm hover:bg-muted/50"
        >
          Reset
        </Link>
      </form>

      {/* Verdicts table */}
      <p className="text-sm text-muted-foreground mb-3">
        {filteredCount === 0
          ? "No verdicts match the filters."
          : `${filteredCount.toLocaleString()} verdict${filteredCount === 1 ? "" : "s"}`}
        {totalPages > 1 && (
          <> · page {clampedPage} of {totalPages}</>
        )}
      </p>

      {verdicts.length === 0 ? (
        <div className="bg-card rounded-lg border border-border border-dashed p-12 text-center">
          <p className="text-base text-muted-foreground">
            {allCurrentCount === 0
              ? "No verdicts yet for this assessment."
              : "No verdicts match the active filters."}
          </p>
          {allCurrentCount === 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Run{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">
                pnpm tsx scripts/brownfield/start-pass.ts {id}
              </code>{" "}
              to start a classification pass.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Bucket</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Item</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Application Area</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Confidence</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {verdicts.map((v) => {
                const bMeta = BUCKET_META[v.bucket] ?? {
                  label: v.bucket,
                  color: "bg-gray-100 text-gray-700",
                };
                const sCls = SOURCE_COLORS[v.source] ?? "bg-gray-50 text-gray-700 border-gray-200";
                const cCls = v.confidence
                  ? CONFIDENCE_COLORS[v.confidence] ?? ""
                  : "text-muted-foreground";
                return (
                  <tr key={v.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bMeta.color}`}>
                        {v.bucket}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/brownfield-catalogs/${assessment.catalogVersion.id}/items/${v.simplificationItem.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {v.simplificationItem.titleEn}
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">
                        {v.simplificationItem.sitemId}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {v.simplificationItem.applicationArea}
                    </td>
                    <td className={`px-4 py-3 text-xs ${cCls}`}>
                      {v.confidence ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${sCls}`}>
                        {v.source}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{v.actor}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground/80 max-w-md">
                      <span className="line-clamp-3">{v.rationaleMd}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm">
          <p className="text-muted-foreground">
            Page {clampedPage} of {totalPages} · {filteredCount.toLocaleString()} total
          </p>
          <div className="flex gap-2">
            <Link
              href={pageHref(Math.max(1, clampedPage - 1))}
              className={`px-3 py-1.5 rounded border border-input ${clampedPage === 1 ? "opacity-50 pointer-events-none" : "hover:bg-muted/50"}`}
            >
              ← Prev
            </Link>
            <Link
              href={pageHref(Math.min(totalPages, clampedPage + 1))}
              className={`px-3 py-1.5 rounded border border-input ${clampedPage === totalPages ? "opacity-50 pointer-events-none" : "hover:bg-muted/50"}`}
            >
              Next →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
