import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Business Function Dispositions" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; disposition?: string }>;
}

const DISPOSITION_LABELS: Record<string, { label: string; color: string }> = {
  ALWAYS_ON: { label: "Always On", color: "bg-green-100 text-green-700" },
  CUSTOMER_CHOICE: { label: "Customer Choice", color: "bg-amber-100 text-amber-700" },
  ALWAYS_OFF: { label: "Always Off", color: "bg-red-100 text-red-700" },
};

export default async function BusinessFunctionsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const dispositionFilter = (sp.disposition ?? "").trim();

  const catalog = await prisma.brownfieldCatalogVersion.findUnique({
    where: { id },
    select: { id: true, label: true },
  });
  if (!catalog) notFound();

  const where: {
    catalogVersionId: string;
    businessFunctionId?: { contains: string; mode: "insensitive" };
    disposition?: string;
  } = { catalogVersionId: id };
  if (search) {
    where.businessFunctionId = { contains: search, mode: "insensitive" };
  }
  if (dispositionFilter) where.disposition = dispositionFilter;

  const items = await prisma.businessFunctionDisposition.findMany({
    where,
    orderBy: [{ disposition: "asc" }, { businessFunctionId: "asc" }],
  });

  const groups = await prisma.businessFunctionDisposition.groupBy({
    by: ["disposition"],
    where: { catalogVersionId: id },
    _count: { id: true },
  });

  const releaseTags = await prisma.businessFunctionDisposition.groupBy({
    by: ["sourceReleaseTag"],
    where: { catalogVersionId: id },
    _count: { id: true },
  });

  return (
    <div className="max-w-5xl">
      <Link
        href={`/admin/brownfield-catalogs/${id}`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to catalog
      </Link>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        Business Function Dispositions
      </h1>
      <p className="text-base text-muted-foreground mb-6">
        Source: SAP Note 2240360 — &quot;SAP S/4HANA: Always-On Business Functions&quot;.
        {catalog.label && <> · {catalog.label}</>} · {items.length.toLocaleString()} rows
      </p>

      {/* Counts grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {groups.map((g) => {
          const meta = DISPOSITION_LABELS[g.disposition] ?? {
            label: g.disposition,
            color: "bg-gray-100 text-gray-700",
          };
          return (
            <div
              key={g.disposition}
              className="bg-card rounded-lg border border-border p-6 text-center"
            >
              <p className="text-3xl font-bold text-foreground">{g._count.id}</p>
              <p className="text-sm text-muted-foreground mt-1">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}
                >
                  {meta.label}
                </span>
              </p>
            </div>
          );
        })}
      </div>

      {releaseTags.length > 1 && (
        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Release tags in this catalog
          </p>
          <div className="flex flex-wrap gap-2">
            {releaseTags.map((r) => (
              <span
                key={r.sourceReleaseTag}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground font-mono"
              >
                {r.sourceReleaseTag} ({r._count.id})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <form
        method="get"
        className="bg-card rounded-lg border border-border p-4 mb-6 flex flex-wrap items-end gap-3"
        action={`/admin/brownfield-catalogs/${id}/business-functions`}
      >
        <div className="flex-1 min-w-[200px]">
          <label
            htmlFor="q"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Search business function ID
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={search}
            placeholder="e.g. /AIF/, FI_, LOG_"
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          />
        </div>
        <div className="min-w-[180px]">
          <label
            htmlFor="disposition"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Disposition
          </label>
          <select
            id="disposition"
            name="disposition"
            defaultValue={dispositionFilter}
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          >
            <option value="">— all —</option>
            {Object.keys(DISPOSITION_LABELS).map((d) => (
              <option key={d} value={d}>
                {DISPOSITION_LABELS[d]?.label}
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
            href={`/admin/brownfield-catalogs/${id}/business-functions`}
            className="px-3 py-1.5 rounded border border-input bg-background text-sm hover:bg-muted/50"
          >
            Reset
          </Link>
        </div>
      </form>

      {items.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <p className="text-base text-muted-foreground">
            No business functions match the current filters.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Business Function</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Disposition</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Source Release</th>
              </tr>
            </thead>
            <tbody>
              {items.map((bf) => {
                const meta = DISPOSITION_LABELS[bf.disposition] ?? {
                  label: bf.disposition,
                  color: "bg-gray-100 text-gray-700",
                };
                return (
                  <tr key={bf.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs text-foreground">
                      {bf.businessFunctionId}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                      {bf.sourceReleaseTag}
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
