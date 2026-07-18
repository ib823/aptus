/**
 * C3 · Process / flow editor drawer — /discovery/library/[scopeId].
 *
 * A route rather than client state so a consultant can link a colleague straight
 * to a process, and so Back closes it.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LibraryManager } from "@/components/discovery/workbench/LibraryManager";
import { ProcessDrawer } from "@/components/discovery/workbench/ProcessDrawer";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { findLibraryRow, libraryFacets, libraryRows } from "@/lib/discovery/workbench/library";
import { loadProductMap } from "@/lib/discovery/workbench/product-map";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scopeId: string }>;
}): Promise<Metadata> {
  const { scopeId } = await params;
  const row = findLibraryRow(scopeId);
  return { title: row ? `${row.scope_id} ${row.name}` : "Process" };
}

export default async function ProcessDrawerPage({
  params,
}: {
  params: Promise<{ scopeId: string }>;
}) {
  const { scopeId } = await params;
  const row = findLibraryRow(scopeId);
  if (!row) notFound();

  const map = (await loadProductMap()).find((m) => m.scopeId === scopeId) ?? null;

  return (
    <WorkbenchView breadcrumb="Library" title="Library manager">
      <LibraryManager rows={libraryRows()} facets={libraryFacets()} />
      <ProcessDrawer row={row} map={map} />
    </WorkbenchView>
  );
}
