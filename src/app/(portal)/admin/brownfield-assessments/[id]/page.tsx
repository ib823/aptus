import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Brownfield Assessment Detail" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string; severity?: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scanning: "bg-blue-100 text-blue-700",
  reviewed: "bg-amber-100 text-amber-700",
  signed_off: "bg-green-100 text-green-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  Red: "bg-red-100 text-red-800",
  Yellow: "bg-amber-100 text-amber-800",
  Green: "bg-green-100 text-green-800",
  Info: "bg-blue-100 text-blue-800",
};

const CATEGORY_COLORS: Record<string, string> = {
  Maintenance: "bg-red-50 text-red-700 border-red-200",
  Security: "bg-purple-50 text-purple-700 border-purple-200",
  Performance: "bg-amber-50 text-amber-700 border-amber-200",
  Database: "bg-blue-50 text-blue-700 border-blue-200",
  Hardware: "bg-slate-50 text-slate-700 border-slate-200",
  ABAP_Dump: "bg-orange-50 text-orange-700 border-orange-200",
  Service_Notes: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Configuration: "bg-cyan-50 text-cyan-700 border-cyan-200",
  Other: "bg-gray-50 text-gray-700 border-gray-200",
};

interface FactsRecord {
  customerName?: string | null;
  sourceSystemId?: string | null;
  sourceProduct?: string | null;
  sourceDatabase?: string | null;
  sourceProductType?: string | null;
  sourceCountry?: string | null;
  sapInstallationNumber?: string | null;
  sapCustomerNumber?: string | null;
  sessionNo?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
}

export default async function BrownfieldAssessmentDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const categoryFilter = (sp.category ?? "").trim();
  const severityFilter = (sp.severity ?? "").trim();

  const assessment = await prisma.brownfieldAssessment.findUnique({
    where: { id },
    include: {
      catalogVersion: {
        select: { id: true, label: true, snapshotDate: true, isActive: true },
      },
      baselineSnapshots: {
        orderBy: { capturedAt: "desc" },
        select: {
          id: true,
          sourceType: true,
          sourceFilePath: true,
          sourceFileHash: true,
          capturedAt: true,
          ingestedAt: true,
          facts: true,
          _count: { select: { ewaFindings: true } },
        },
      },
    },
  });
  if (!assessment) notFound();

  const findingWhere: {
    snapshot: { brownfieldAssessmentId: string };
    category?: string;
    severity?: string;
  } = { snapshot: { brownfieldAssessmentId: id } };
  if (categoryFilter) findingWhere.category = categoryFilter;
  if (severityFilter) findingWhere.severity = severityFilter;

  const findings = await prisma.ewaFinding.findMany({
    where: findingWhere,
    orderBy: [{ snapshotId: "asc" }, { sortOrder: "asc" }],
  });

  const findingCategoryGroups = await prisma.ewaFinding.groupBy({
    by: ["category"],
    where: { snapshot: { brownfieldAssessmentId: id } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });
  const findingSeverityGroups = await prisma.ewaFinding.groupBy({
    by: ["severity"],
    where: { snapshot: { brownfieldAssessmentId: id } },
    _count: { id: true },
  });

  const totalFindings = findingCategoryGroups.reduce((s, g) => s + g._count.id, 0);

  return (
    <div className="max-w-6xl">
      <Link
        href="/admin/brownfield-assessments"
        className="text-sm text-blue-600 hover:underline"
      >
        ← All brownfield assessments
      </Link>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        {assessment.name}
      </h1>
      <p className="text-base text-muted-foreground mb-6">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mr-2 ${STATUS_COLORS[assessment.status] ?? "bg-gray-100 text-gray-700"}`}
        >
          {assessment.status}
        </span>
        Created {assessment.createdAt.toISOString().slice(0, 10)} · updated{" "}
        {assessment.updatedAt.toISOString().slice(0, 10)} · pinned to{" "}
        <Link
          href={`/admin/brownfield-catalogs/${assessment.catalogVersion.id}`}
          className="text-blue-600 hover:underline"
        >
          {assessment.catalogVersion.label ??
            assessment.catalogVersion.snapshotDate.toISOString().slice(0, 10)}
        </Link>
      </p>

      {/* Source system facts */}
      <div className="bg-card rounded-lg border border-border p-5 mb-6">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Source System
        </h3>
        <dl className="grid grid-cols-3 gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Customer</dt>
            <dd className="text-foreground">{assessment.customerName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Country</dt>
            <dd className="text-foreground">
              {assessment.sourceCountry ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">System ID</dt>
            <dd className="font-mono text-foreground">
              {assessment.sourceSystemId ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Product</dt>
            <dd className="text-foreground">
              {assessment.sourceProduct ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Database</dt>
            <dd className="text-foreground">
              {assessment.sourceDatabase ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Product type</dt>
            <dd className="text-foreground">
              {assessment.sourceProductType ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Installation #</dt>
            <dd className="font-mono text-xs text-foreground">
              {assessment.sapInstallationNumber ?? (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Customer #</dt>
            <dd className="font-mono text-xs text-foreground">
              {assessment.sapCustomerNumber ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Target release</dt>
            <dd className="text-foreground">
              {assessment.targetRelease ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
        </dl>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">
            {assessment.baselineSnapshots.length}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Baseline Snapshots</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-foreground">{totalFindings}</p>
          <p className="text-sm text-muted-foreground mt-1">Findings (all snapshots)</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <p className="text-3xl font-bold text-red-700">
            {findingSeverityGroups.find((g) => g.severity === "Red")?._count.id ?? 0}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Red Severity</p>
        </div>
      </div>

      {/* Snapshots section */}
      <div className="bg-card rounded-lg border border-border overflow-hidden mb-8">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-6 py-4 border-b border-border">
          Baseline Snapshots
        </h3>
        {assessment.baselineSnapshots.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            No snapshots ingested for this assessment yet.
          </p>
        ) : (
          <div>
            {assessment.baselineSnapshots.map((s) => {
              const facts = (s.facts as FactsRecord | null) ?? null;
              return (
                <div
                  key={s.id}
                  className="px-6 py-4 border-t border-border first:border-t-0"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 mr-2">
                        {s.sourceType}
                      </span>
                      <span className="text-sm text-foreground">
                        Captured{" "}
                        {s.capturedAt
                          ? s.capturedAt.toISOString().slice(0, 10)
                          : "(unknown)"}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        · ingested {s.ingestedAt.toISOString().slice(0, 10)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s._count.ewaFindings} findings
                    </span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground mb-1 break-all">
                    {s.sourceFilePath}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground/70 break-all">
                    sha256 {s.sourceFileHash.slice(0, 24)}…
                  </p>
                  {facts && (
                    <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
                      {facts.periodFrom && (
                        <div>
                          <span className="text-muted-foreground">Period: </span>
                          <span className="text-foreground">
                            {facts.periodFrom.slice(0, 10)} →{" "}
                            {facts.periodTo?.slice(0, 10) ?? "?"}
                          </span>
                        </div>
                      )}
                      {facts.sessionNo && (
                        <div>
                          <span className="text-muted-foreground">Session #: </span>
                          <span className="font-mono">{facts.sessionNo}</span>
                        </div>
                      )}
                      {facts.sourceProduct && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Product: </span>
                          <span>{facts.sourceProduct}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Findings filters + table */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Findings
        </h3>
      </div>

      <form
        method="get"
        className="bg-card rounded-lg border border-border p-4 mb-6 flex flex-wrap items-end gap-3"
        action={`/admin/brownfield-assessments/${id}`}
      >
        <div className="min-w-[200px]">
          <label
            htmlFor="category"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={categoryFilter}
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          >
            <option value="">— all —</option>
            {findingCategoryGroups.map((g) => (
              <option key={g.category} value={g.category}>
                {g.category} ({g._count.id})
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px]">
          <label
            htmlFor="severity"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Severity
          </label>
          <select
            id="severity"
            name="severity"
            defaultValue={severityFilter}
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          >
            <option value="">— all —</option>
            {findingSeverityGroups.map((g) => (
              <option key={g.severity} value={g.severity}>
                {g.severity} ({g._count.id})
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="px-3 py-1.5 rounded border border-input bg-background text-sm hover:bg-muted/50"
          >
            Apply
          </button>
          <Link
            href={`/admin/brownfield-assessments/${id}`}
            className="px-3 py-1.5 rounded border border-input bg-background text-sm hover:bg-muted/50"
          >
            Reset
          </Link>
        </div>
      </form>

      {findings.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <p className="text-base text-muted-foreground">
            {categoryFilter || severityFilter
              ? "No findings match the current filters."
              : "No findings recorded for this assessment yet."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">#</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Severity</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Title</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f, idx) => {
                const sevColor =
                  SEVERITY_COLORS[f.severity] ?? "bg-gray-100 text-gray-700";
                const catColor =
                  CATEGORY_COLORS[f.category] ?? "bg-gray-50 text-gray-700 border-gray-200";
                return (
                  <tr key={f.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2 text-xs text-muted-foreground tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sevColor}`}
                      >
                        {f.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${catColor}`}
                      >
                        {f.category}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-foreground">{f.title}</td>
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
