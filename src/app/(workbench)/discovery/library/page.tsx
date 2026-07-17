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
import { composeLibrary, libraryFacets } from "@/lib/discovery/workbench/library";
import { promotedEntries } from "@/lib/discovery/workbench/capture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library manager" };

export default async function LibraryPage() {
  // Committed JSON + promoted entries. The JSON stays byte-frozen; the view
  // composes (P4 §4 / the PR-6 architectural directive).
  const composed = composeLibrary(await promotedEntries());
  const rows = composed.rows;
  const facets = libraryFacets();
  return (
    <WorkbenchView
      breadcrumb="Library"
      title="Library manager"
      caption={`${rows.length} processes · ${facets.hasFlow.yes} with a step flow${composed.promotedCount > 0 ? ` · ${composed.promotedCount} client-captured` : ""}${composed.registerOnlyCount > 0 ? ` · ${composed.registerOnlyCount} held in the register` : ""}`}
    >
      <LibraryManager rows={rows} facets={facets} />
    </WorkbenchView>
  );
}
