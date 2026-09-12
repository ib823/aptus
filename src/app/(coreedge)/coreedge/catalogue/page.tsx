import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../CoreEdgeShell";

/**
 * A place in the rail that is not built yet — and therefore OPENS.
 *
 * The handoff's rule for the rail is exact: "Six places in the rail, all always
 * visible and enabled. A place you cannot act in still opens; the actions inside
 * carry the reason." A rail entry that 404s breaks that rule as surely as one
 * that redirects on role — the reader cannot tell whether they lack a
 * permission, took a wrong turn, or the feature does not exist.
 *
 * So this renders, names itself, and says plainly that it is not built. It is
 * NOT a placeholder pretending to be a screen: no fake rows, no skeleton
 * implying something is loading, and no chip claiming a status nothing measured.
 * An empty screen that lies is worse than one that admits it is empty.
 */

export const metadata: Metadata = { title: "Catalogue" };

export default async function Page(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  return (
    <CoreEdgeShell current="/coreedge/catalogue" title={"Catalogue"}>
      <p className="max-w-prose text-sm text-ink-soft">Every SAP data feed this organization can reach, and what has been proven about each.</p>
      <p className="max-w-prose text-sm text-ink-muted">
        This place is not built yet. It stays in the rail because every place stays in the rail —
        removing it would leave you unable to tell whether the feature exists.
      </p>
    </CoreEdgeShell>
  );
}
