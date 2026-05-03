import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Simplification Item Detail" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; itemId: string }>;
}

function noteUrl(noteId: string): string {
  return `https://me.sap.com/notes/${noteId.replace(/^0+/, "")}`;
}

export default async function SimplificationItemDetailPage({ params }: PageProps) {
  const { id, itemId } = await params;

  const item = await prisma.simplificationItem.findUnique({
    where: { id: itemId },
    include: {
      checks: {
        orderBy: [{ checkType: "asc" }, { checkIdentifier: "asc" }],
      },
      notes: {
        orderBy: [{ noteType: "asc" }, { sapNote: "asc" }],
      },
      brownfieldCatalog: {
        select: { id: true, label: true, snapshotDate: true },
      },
    },
  });
  if (!item || item.catalogVersionId !== id) notFound();

  // Resolve impactNote → matching RelatedSapNote in same catalog (if any)
  const impactNoteRow = item.impactNote
    ? await prisma.relatedSapNote.findFirst({
        where: { catalogVersionId: id, sapNote: item.impactNote },
        select: { sapNote: true, noteType: true, noteTypeTextEn: true },
      })
    : null;

  // Resolve businessAreaGuid → name (if any)
  const businessArea = item.businessAreaGuid
    ? await prisma.brownfieldLineOfBusiness.findFirst({
        where: { catalogVersionId: id, sapId: item.businessAreaGuid },
        select: { name: true, type: true },
      })
    : null;

  const lobTechnology = item.lobTechnologyGuid
    ? await prisma.brownfieldLineOfBusiness.findFirst({
        where: { catalogVersionId: id, sapId: item.lobTechnologyGuid },
        select: { name: true, type: true },
      })
    : null;

  // Cross-link to greenfield ScopeItem rows when affectedScopeCodes is set
  const linkedScopeItems =
    item.affectedScopeCodes.length > 0
      ? await prisma.scopeItem.findMany({
          where: { scopeCode: { in: item.affectedScopeCodes } },
          select: {
            id: true,
            scopeCode: true,
            nameClean: true,
            catalogVersion: { select: { edition: true, version: true } },
          },
          take: 50,
        })
      : [];

  return (
    <div className="max-w-5xl">
      <Link
        href={`/admin/brownfield-catalogs/${id}/items`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← All simplification items
      </Link>
      <h1 className="text-2xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        {item.titleEn}
      </h1>
      <p className="text-sm text-muted-foreground mb-6 font-mono">
        {item.sitemId} · {item.procStatus === "R" ? "Released" : item.procStatus} ·{" "}
        application area {item.applicationArea}
      </p>

      {/* Identity card */}
      <div className="bg-card rounded-lg border border-border p-5 mb-6">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Identity
        </h3>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">SAP GUID</dt>
            <dd className="font-mono text-xs text-foreground break-all">{item.sapGuid}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">SItem ID</dt>
            <dd className="text-foreground">{item.sitemId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Application Area</dt>
            <dd className="text-foreground">{item.applicationArea}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-foreground">
              {item.procStatusTextEn} ({item.procStatus})
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Check condition</dt>
            <dd className="text-foreground">{item.checkCondition ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Catalog snapshot</dt>
            <dd className="text-foreground">
              <Link
                href={`/admin/brownfield-catalogs/${id}`}
                className="text-blue-600 hover:underline"
              >
                {item.brownfieldCatalog.label ??
                  item.brownfieldCatalog.snapshotDate.toISOString().slice(0, 10)}
              </Link>
            </dd>
          </div>
        </dl>
      </div>

      {/* Taxonomy card */}
      <div className="bg-card rounded-lg border border-border p-5 mb-6">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Taxonomy
        </h3>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Business Area</dt>
            <dd className="text-foreground">
              {businessArea ? (
                <>
                  {businessArea.name}{" "}
                  <span className="text-xs text-muted-foreground">({businessArea.type})</span>
                </>
              ) : item.businessAreaGuid ? (
                <span className="font-mono text-xs">{item.businessAreaGuid}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">LOB / Technology</dt>
            <dd className="text-foreground">
              {lobTechnology ? (
                <>
                  {lobTechnology.name}{" "}
                  <span className="text-xs text-muted-foreground">({lobTechnology.type})</span>
                </>
              ) : item.lobTechnologyGuid ? (
                <span className="font-mono text-xs">{item.lobTechnologyGuid}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Source release applicability */}
      <div className="bg-card rounded-lg border border-border p-5 mb-6">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Source Release Applicability
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Bounds on which start product version + stack the SItem applies to. * = unbounded.
        </p>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Valid From — Product Version</dt>
            <dd className="font-mono text-foreground">
              {item.startRelValidFromPrdVer ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Valid From — Stack</dt>
            <dd className="font-mono text-foreground">
              {item.startRelValidFromStack ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Valid To — Product Version</dt>
            <dd className="font-mono text-foreground">
              {item.startRelValidToPrdVer ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Valid To — Stack</dt>
            <dd className="font-mono text-foreground">
              {item.startRelValidToStack ?? "—"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Impact note */}
      {item.impactNote && (
        <div className="bg-card rounded-lg border border-border p-5 mb-6">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Business Impact Note
          </h3>
          <a
            href={noteUrl(item.impactNote)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline font-mono"
          >
            SAP Note {item.impactNote.replace(/^0+/, "")} ↗
          </a>
          {impactNoteRow && (
            <p className="text-xs text-muted-foreground mt-1">
              {impactNoteRow.noteTypeTextEn ?? impactNoteRow.noteType}
            </p>
          )}
        </div>
      )}

      {/* Checks */}
      <div className="bg-card rounded-lg border border-border overflow-hidden mb-6">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-6 py-4 border-b border-border">
          SI-Check Rules ({item.checks.length})
        </h3>
        {item.checks.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            No checks registered for this item.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Identifier</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Sub-ID</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">SAP Note</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Threshold</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Class Usage</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">BF State</th>
              </tr>
            </thead>
            <tbody>
              {item.checks.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">
                    {c.checkType}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-foreground">
                    {c.checkIdentifier}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">
                    {c.checkSubIdentifier ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {c.sapNote && c.sapNote !== "0000000000" ? (
                      <a
                        href={noteUrl(c.sapNote)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-mono"
                      >
                        {c.sapNote.replace(/^0+/, "")}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-foreground">
                    {c.checkCountOption && c.checkCount !== null
                      ? `${c.checkCountOption} ${c.checkCount}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {c.checkClassUsage ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {c.bfChkState ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Notes */}
      {item.notes.length > 0 && (
        <div className="bg-card rounded-lg border border-border overflow-hidden mb-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-6 py-4 border-b border-border">
            Related Notes ({item.notes.length})
          </h3>
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">SAP Note</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Type</th>
              </tr>
            </thead>
            <tbody>
              {item.notes.map((n) => (
                <tr key={n.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <a
                      href={noteUrl(n.sapNote)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono text-xs"
                    >
                      {n.sapNote.replace(/^0+/, "")} ↗
                    </a>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {n.noteTypeTextEn ?? n.noteType}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Greenfield cross-links */}
      <div className="bg-card rounded-lg border border-border p-5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Linked Greenfield Scope Items
        </h3>
        {item.affectedScopeCodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cross-link recorded. The brownfield-greenfield reconciliation pass has not run yet
            for this item — when run, it will populate <code>affectedScopeCodes</code> by parsing
            the SItem title for explicit scope code references (e.g. &quot;J60 - Asset
            Accounting&quot;).
          </p>
        ) : linkedScopeItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Recorded codes: {item.affectedScopeCodes.join(", ")} — but none resolve to a current
            ScopeItem row. Re-run reconciliation if the greenfield catalog has changed.
          </p>
        ) : (
          <div className="space-y-2">
            {linkedScopeItems.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 text-sm"
              >
                <span className="font-mono text-blue-600">{s.scopeCode}</span>
                <span className="text-foreground flex-1 mx-3 truncate">{s.nameClean}</span>
                <span className="text-xs text-muted-foreground">
                  {s.catalogVersion.edition} {s.catalogVersion.version}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
