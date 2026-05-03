import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Pre-Check Notes" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ role?: string; q?: string }>;
}

const ROLE_LABELS: Record<string, { label: string; description: string; color: string }> = {
  UMBRELLA: {
    label: "Umbrella",
    description: "The master pre-check note (entry point to the SI-Check framework).",
    color: "bg-purple-100 text-purple-700",
  },
  PREREQUISITE_AUTO: {
    label: "Auto Prerequisite",
    description:
      "Automatically pulled when the umbrella is implemented (per SAP's prerequisite chain).",
    color: "bg-blue-100 text-blue-700",
  },
  PREREQUISITE: {
    label: "Prerequisite",
    description:
      "Manual prerequisite scoped to a specific software component + release range.",
    color: "bg-amber-100 text-amber-700",
  },
  REFERENCES: {
    label: "References",
    description: "Notes that the umbrella explicitly cites (the umbrella refers to them).",
    color: "bg-slate-100 text-slate-700",
  },
  REFERENCED_BY: {
    label: "Referenced By",
    description: "Notes that cite the umbrella back (downstream context).",
    color: "bg-slate-100 text-slate-700",
  },
};

function noteUrl(noteId: string): string {
  return `https://me.sap.com/notes/${noteId.replace(/^0+/, "")}`;
}

export default async function PreCheckNotesPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const roleFilter = (sp.role ?? "").trim();
  const search = (sp.q ?? "").trim();

  const catalog = await prisma.brownfieldCatalogVersion.findUnique({
    where: { id },
    select: { id: true, label: true, snapshotDate: true },
  });
  if (!catalog) notFound();

  const where: {
    catalogVersionId: string;
    role?: string;
    OR?: Array<Record<string, unknown>>;
  } = { catalogVersionId: id };
  if (roleFilter) where.role = roleFilter;
  if (search) {
    where.OR = [
      { sapNoteId: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { component: { contains: search, mode: "insensitive" } },
      { softwareComponent: { contains: search, mode: "insensitive" } },
    ];
  }

  const notes = await prisma.preCheckNote.findMany({
    where,
    orderBy: [{ role: "asc" }, { sapNoteId: "asc" }],
  });

  // Group by role for display
  const byRole = new Map<string, typeof notes>();
  for (const n of notes) {
    const list = byRole.get(n.role) ?? [];
    list.push(n);
    byRole.set(n.role, list);
  }

  // Always show all known roles for filter dropdown
  const allRoleCounts = await prisma.preCheckNote.groupBy({
    by: ["role"],
    where: { catalogVersionId: id },
    _count: { id: true },
  });

  return (
    <div className="max-w-6xl">
      <Link
        href={`/admin/brownfield-catalogs/${id}`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to catalog
      </Link>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        Pre-Check Notes
      </h1>
      <p className="text-base text-muted-foreground mb-6">
        Parsed from SAP Note 2502552 (the umbrella S4TC pre-check note for S/4HANA conversion).
        {catalog.label && <> · {catalog.label}</>} · {notes.length.toLocaleString()} rows
        {(roleFilter || search) && <> matching filters</>}
      </p>

      {/* Filter bar */}
      <form
        method="get"
        className="bg-card rounded-lg border border-border p-4 mb-6 flex flex-wrap items-end gap-3"
        action={`/admin/brownfield-catalogs/${id}/notes`}
      >
        <div className="flex-1 min-w-[200px]">
          <label
            htmlFor="q"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Search (note ID / title / component / software component)
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={search}
            placeholder="e.g. 3674234, FI-CML, SAP_BASIS"
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          />
        </div>
        <div className="min-w-[200px]">
          <label
            htmlFor="role"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue={roleFilter}
            className="w-full px-3 py-1.5 rounded border border-input bg-background text-sm"
          >
            <option value="">— all —</option>
            {allRoleCounts.map((r) => (
              <option key={r.role} value={r.role}>
                {ROLE_LABELS[r.role]?.label ?? r.role} ({r._count.id})
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
            href={`/admin/brownfield-catalogs/${id}/notes`}
            className="px-3 py-1.5 rounded border border-input bg-background text-sm hover:bg-muted/50"
          >
            Reset
          </Link>
        </div>
      </form>

      {notes.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <p className="text-base text-muted-foreground">No notes match the current filters.</p>
        </div>
      ) : (
        Array.from(byRole.entries()).map(([role, rows]) => {
          const meta = ROLE_LABELS[role] ?? {
            label: role,
            description: "",
            color: "bg-gray-100 text-gray-700",
          };
          return (
            <div
              key={role}
              className="bg-card rounded-lg border border-border overflow-hidden mb-6"
            >
              <div className="px-6 py-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {rows.length.toLocaleString()} rows
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{meta.description}</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Note ID</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Title</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Component</th>
                    {role === "PREREQUISITE" && (
                      <>
                        <th className="px-4 py-3 font-medium text-muted-foreground">SWC</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">From</th>
                        <th className="px-4 py-3 font-medium text-muted-foreground">To</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((n) => (
                    <tr key={n.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <a
                          href={n.url ?? noteUrl(n.sapNoteId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-mono text-xs"
                        >
                          {n.sapNoteId.replace(/^0+/, "")} ↗
                        </a>
                      </td>
                      <td className="px-4 py-2 text-foreground">
                        {n.title ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                        {n.component ?? "—"}
                      </td>
                      {role === "PREREQUISITE" && (
                        <>
                          <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                            {n.softwareComponent ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-xs font-mono">{n.releaseFrom ?? "—"}</td>
                          <td className="px-4 py-2 text-xs font-mono">{n.releaseTo ?? "—"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}
