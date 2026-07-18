/**
 * C2 · Library manager — /discovery/library.
 *
 * The consultant dataset is the legitimate source here: origin, APQC and
 * provenance are exactly what this view exists to govern. Completeness is
 * derived across the client↔consultant join (D2).
 */

import type { Metadata } from "next";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { LibraryManager } from "@/components/discovery/workbench/LibraryManager";
import { libraryFacets, libraryRows } from "@/lib/discovery/workbench/library";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library manager" };

export default function LibraryPage() {
  const rows = libraryRows();
  const facets = libraryFacets();
  return (
    <WorkbenchView
      breadcrumb="Library"
      title="Library manager"
      caption={`${rows.length} processes · ${facets.hasFlow.yes} with a step flow · ${facets.hasFlow.no} without`}
    >
      <LibraryManager rows={rows} facets={facets} />
    </WorkbenchView>
  );
}
