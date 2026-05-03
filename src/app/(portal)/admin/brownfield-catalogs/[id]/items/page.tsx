import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Simplification Items" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    area?: string;
    status?: string;
  }>;
}

const PAGE_SIZE = 50;

export default async function SimplificationItemsListPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  const catalog = await prisma.brownfieldCatalogVersion.findUnique({
    where: { id },
    select: { id: true, label: true, snapshotDate: true, isActive: true },
  });
  if (!catalog) notFound();

  const requestedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const search = (sp.q ?? "").trim();
  const areaFilter = (sp.area ?? "").trim();
  const statusFilter = (sp.status ?? "").trim();

  const where: Prisma.SimplificationItemWhereInput = { catalogVersionId: id };
  if (search) {
    where.OR = [
      { sapGuid: { contains: search, mode: "insensitive" } },
      { sitemId: { contains: search, mode: "insensitive" } },
      { titleEn: { contains: search, mode: "insensitive" } },
      { impactNote: { contains: search, mode: "insensitive" } },
    ];
  }
  if (areaFilter) where.applicationArea = areaFilter;
  if (statusFilter) where.procStatus = statusFilter;

  const totalCount = await prisma.simplificationItem.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);

  const items = await prisma.simplificationItem.findMany({
    where,
    orderBy: [{ applicationArea: "asc" }, { titleEn: "asc" }],
    skip: (clampedPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      sapGuid: true,
      sitemId: true,
      titleEn: true,
      applicationArea: true,
      procStatus: true,
      checkCondition: true,
      impactNote: true,
      _count: { select: { checks: true, notes: true } },
    },
  });

  // For the area filter dropdown
  const areas = await prisma.brownfieldApplicationArea.findMany({
    where: { catalogVersionId: id },
    orderBy: { areaName: "asc" },
    select: { areaName: true },
  });

  const baseQuery = new URLSearchParams();
  if (search) baseQuery.set("q", search);
  if (areaFilter) baseQuery.set("area", areaFilter);
  if (statusFilter) baseQuery.set("status", statusFilter);

  function pageHref(targetPage: number): string {
    const q = new URLSearchParams(baseQuery);
    q.set("page", String(targetPage));
    return `/admin/brownfield-catalogs/${id}/items?${q.toString()}`;
  }

  return (
    <div className="max-w-6xl">
      <Link
        href={`/admin/brownfield-catalogs/${id}`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to catalog
      </Link>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        Simplification Items
      </h1>
      <p className="text-base text-muted-foreground mb-6">
        {catalog.label ?? `SIC ${catalog.snapshotDate.toISOString().slice(0, 10)}`} ·{" "}
        {totalCount.toLocaleString()} items
        {(search || areaFilter || statusFilter) && (
          <> matching filters</>
        )}
      </p>

      {/* Filter bar */}
      <form
        method="get"
        className="bg-card rounded-lg border border-border p-4 mb-6 flex flex-wrap items-end gap-3"
        action={`/admin/brownfield-catalogs/${id}/items`}
      >
        <div className="flex-1 min-w-[200px]">
          <label
            htmlFor="q"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Search (SAP GUID / sitem ID / title / impact note)
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={search}
            placeholder="e.g. Logistics, J60, 0002267189"
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          />
        </div>
        <div className="min-w-[200px]">
          <label
            htmlFor="area"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Application Area
          </label>
          <select
            id="area"
            name="area"
            defaultValue={areaFilter}
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          >
            <option value="">— all —</option>
            {areas.map((a) => (
              <option key={a.areaName} value={a.areaName}>
                {a.areaName}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[120px]">
          <label
            htmlFor="status"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          >
            <option value="">— all —</option>
            <option value="R">R (Released)</option>
            <option value="P">P (Processing)</option>
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
            href={`/admin/brownfield-catalogs/${id}/items`}
            className="px-3 py-1.5 rounded border border-input bg-background text-sm hover:bg-muted/50"
          >
            Reset
          </Link>
        </div>
      </form>

      {/* Items table */}
      {items.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <p className="text-base text-muted-foreground">No items match the current filters.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">SItem ID</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Application Area</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Cond</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Checks</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    <Link
                      href={`/admin/brownfield-catalogs/${id}/items/${s.id}`}
                      className="hover:underline text-blue-600"
                    >
                      {s.sitemId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">{s.titleEn}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{s.applicationArea}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{s.procStatus}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {s.checkCondition ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s._count.checks}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s._count.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm">
          <p className="text-muted-foreground">
            Page {clampedPage} of {totalPages} · {totalCount.toLocaleString()} total
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
